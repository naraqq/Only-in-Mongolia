<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CreatorPostsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
    }

    private function creator(string $status = CreatorProfile::APPROVED, bool $adult = false, string $handle = 'saraa'): CreatorProfile
    {
        $user = User::factory()->create(['birthdate' => '1999-03-15']);

        return $user->creatorProfile()->create([
            'handle' => $handle, 'display_name' => 'Saraa', 'price_monthly' => 15000, 'adult_content' => $adult,
            'legal_name' => 'Батын Сараа', 'register_number' => 'УБ990315'.str_pad((string) random_int(0, 99), 2, '0', STR_PAD_LEFT).$handle, 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => (string) random_int(5000000000, 5999999999), 'account_holder' => 'Сараа',
            'consented_at' => now(), 'status' => $status,
        ]);
    }

    private function publish(CreatorProfile $c, array $attrs = []): Post
    {
        $this->actingAs($c->user)->post('/studio/posts', [
            'body' => 'Hello fans', 'visibility' => 'public', 'is_adult' => false,
            'media' => [UploadedFile::fake()->image('a.jpg')],
            ...$attrs,
        ])->assertSessionHasNoErrors();
        auth()->logout();

        return Post::latest('id')->first();
    }

    public function test_only_approved_creators_have_a_page_and_a_studio(): void
    {
        $pending = $this->creator(CreatorProfile::PENDING);
        $this->get('/@saraa')->assertNotFound();
        $this->actingAs($pending->user)->get('/studio')->assertForbidden();
        $this->actingAs(User::factory()->create())->get('/studio')->assertForbidden();

        $pending->update(['status' => CreatorProfile::APPROVED]);
        auth()->logout();
        $this->get('/@saraa')->assertOk()->assertInertia(fn ($p) => $p->component('creator/show')->where('creator.handle', 'saraa'));
        $this->actingAs($pending->user)->get('/studio')->assertOk();
    }

    public function test_free_posts_are_visible_and_subscriber_posts_reveal_nothing(): void
    {
        $c = $this->creator();
        $free = $this->publish($c, ['body' => 'Free hello']);
        $locked = $this->publish($c, ['body' => 'Secret text', 'visibility' => 'subscribers', 'media' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->image('b.jpg')]]);

        $this->get('/@saraa')->assertInertia(fn ($p) => $p
            ->has('posts', 2)
            ->where('posts.0.id', $locked->id)
            ->where('posts.0.locked', 'subscribe')
            ->where('posts.0.body', null)
            ->where('posts.0.media', [])
            ->where('posts.0.counts.image', 2)
            ->where('posts.1.body', 'Free hello')
            ->has('posts.1.media', 1));

        // Direct media links follow the same rule.
        $this->get("/media/{$free->media->first()->id}")->assertOk();
        $this->get("/media/{$locked->media->first()->id}")->assertForbidden();
        $this->actingAs(User::factory()->create())->get("/media/{$locked->media->first()->id}")->assertForbidden();

        // The creator and admins always see everything.
        $this->actingAs($c->user)->get("/media/{$locked->media->first()->id}")->assertOk();
        $admin = User::factory()->create();
        $admin->forceFill(['is_admin' => true])->save();
        $this->actingAs($admin)->get("/media/{$locked->media->first()->id}")->assertOk();
    }

    public function test_adult_content_is_never_shown_to_signed_out_visitors(): void
    {
        $c = $this->creator(adult: true);
        $p = $this->publish($c, ['is_adult' => true]);

        // The whole page is gated for visitors.
        $this->get('/@saraa')->assertInertia(fn ($page) => $page->where('gated', true)->where('posts', []));
        $this->get("/media/{$p->media->first()->id}")->assertForbidden();

        // Signed-in adults see it.
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($fan)->get('/@saraa')->assertInertia(fn ($page) => $page->where('gated', false)->where('posts.0.body', 'Hello fans'));
        $this->actingAs($fan)->get("/media/{$p->media->first()->id}")->assertOk();
    }

    public function test_18_plus_posts_need_an_18_plus_page_and_posts_need_content(): void
    {
        $c = $this->creator(adult: false);

        $this->actingAs($c->user)->post('/studio/posts', ['body' => 'x', 'visibility' => 'public', 'is_adult' => true])->assertSessionHasErrors('is_adult');
        $this->actingAs($c->user)->post('/studio/posts', ['visibility' => 'public'])->assertSessionHasErrors('body');
        $this->actingAs($c->user)->post('/studio/posts', ['body' => 'x', 'visibility' => 'public', 'media' => [UploadedFile::fake()->create('evil.exe', 10, 'application/x-msdownload')]])->assertSessionHasErrors('media.0');
        $this->assertSame(0, Post::count());
    }

    public function test_only_the_creator_can_delete_and_files_are_removed(): void
    {
        $c = $this->creator();
        $p = $this->publish($c);
        $path = $p->media->first()->path;
        Storage::assertExists($path);

        $other = $this->creator(handle: 'bold');
        $this->actingAs($other->user)->delete("/studio/posts/{$p->id}")->assertForbidden();

        $this->actingAs($c->user)->delete("/studio/posts/{$p->id}")->assertRedirect('/studio');
        $this->assertSame(0, Post::count());
        // The upload stays in the creator's media library until it's removed from there too.
        Storage::assertExists($path);
        $this->delete(route('studio.library.destroy', $c->vaultItems()->sole()));
        Storage::assertMissing($path);
    }
}
