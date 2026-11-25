<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PostingTest extends TestCase
{
    use RefreshDatabase;

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    public function test_scheduled_posts_stay_hidden_until_their_time_and_are_announced_once(): void
    {
        $creator = $this->creator();
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addMonth()]);
        $fan->following()->attach($creator->id);

        $this->actingAs($creator->user)->post('/studio/posts', ['body' => 'Soon', 'visibility' => 'public', 'publish_at' => now()->subMinute()->toIso8601String()])
            ->assertSessionHasErrors('publish_at'); // must be in the future
        $this->post('/studio/posts', ['body' => 'Soon', 'visibility' => 'public', 'publish_at' => now()->addHour()->toIso8601String()])
            ->assertSessionHas('status', 'scheduled');
        $post = Post::sole();

        // Only the creator sees it (marked as scheduled); nobody is told yet.
        $this->get('/studio')->assertInertia(fn ($p) => $p->whereNot('posts.0.publish_at', null));
        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p->has('posts', 0)->where('creator.posts_count', 0));
        $this->get('/')->assertInertia(fn ($p) => $p->has('posts', 0));
        $this->postJson("/posts/{$post->id}/like")->assertNotFound();
        $this->assertSame(0, $fan->notifications()->count());

        $this->artisan('posts:announce')->expectsOutput('Announced 0 posts.');
        $this->travel(61)->minutes();
        $this->artisan('posts:announce')->expectsOutput('Announced 1 posts.');
        $this->artisan('posts:announce')->expectsOutput('Announced 0 posts.');

        $this->assertSame(1, $fan->notifications()->where('type', 'new_post')->count());
        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p->has('posts', 1)->where('posts.0.publish_at', null));
    }

    public function test_creators_edit_their_posts_and_publishing_a_scheduled_one_early_announces_it(): void
    {
        $creator = $this->creator();
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addMonth()]);
        $post = $creator->posts()->create(['body' => 'Old', 'visibility' => 'subscribers', 'publish_at' => now()->addDay()]);

        $this->actingAs($creator->user)->patch("/studio/posts/{$post->id}", ['body' => 'New text', 'visibility' => 'public', 'price' => 7000])
            ->assertSessionHasNoErrors();
        $post->refresh();
        $this->assertSame(['New text', 'public', 7000, null], [$post->body, $post->visibility, $post->price, $post->publish_at]);
        $this->assertNotNull($post->announced_at);
        $this->assertSame(1, $fan->notifications()->count());

        // Editing again doesn't notify again, and other people can't edit it.
        $this->patch("/studio/posts/{$post->id}", ['body' => 'Again', 'visibility' => 'public'])->assertSessionHasNoErrors();
        $this->assertSame(1, $fan->notifications()->count());
        $this->actingAs($fan)->patch("/studio/posts/{$post->id}", ['body' => 'x', 'visibility' => 'public'])->assertForbidden();
    }

    public function test_pinned_post_comes_first_and_the_media_tab_shows_only_posts_with_media(): void
    {
        Storage::fake();
        $creator = $this->creator();
        $old = $creator->posts()->create(['body' => 'Old', 'visibility' => 'public']);
        $this->travel(1)->minutes();
        $this->actingAs($creator->user)->post('/studio/posts', ['body' => 'Photo', 'visibility' => 'public', 'media' => [UploadedFile::fake()->image('a.jpg')]]);
        $photo = Post::latest('id')->first();

        $this->post("/studio/posts/{$old->id}/pin");
        $this->assertSame($old->id, $creator->fresh()->pinned_post_id);
        $this->get('/@artist')->assertInertia(fn ($p) => $p
            ->where('posts.0.id', $old->id)->where('posts.0.pinned', true)
            ->where('posts.1.id', $photo->id)->has('posts', 2)
            ->where('creator.media_count', 1));
        $this->get('/@artist?tab=media')->assertInertia(fn ($p) => $p->where('tab', 'media')->has('posts', 1)->where('posts.0.id', $photo->id));

        $this->post("/studio/posts/{$old->id}/pin"); // unpin
        $this->assertNull($creator->fresh()->pinned_post_id);
    }
}
