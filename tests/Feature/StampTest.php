<?php

namespace Tests\Feature;

use App\Media\Stamp;
use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\PostMedia;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StampTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => 'everyone',
        ]);
    }

    private function photo(): string
    {
        return UploadedFile::fake()->image('p.jpg', 1200, 800)->store('posts');
    }

    private function makePost(CreatorProfile $creator, string $visibility, ?int $price = null): PostMedia
    {
        $post = $creator->posts()->create(['body' => 'x', 'visibility' => $visibility, 'price' => $price]);

        return $post->media()->create(['type' => 'image', 'path' => $this->photo(), 'mime' => 'image/jpeg', 'position' => 0]);
    }

    private function bytes($response): string
    {
        return file_get_contents($response->baseResponse->getFile()->getPathname());
    }

    public function test_subscriber_photos_carry_the_viewers_id_but_free_ones_and_the_creators_own_do_not(): void
    {
        $creator = $this->creator();
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addMonth()]);
        $private = $this->makePost($creator, Post::SUBSCRIBERS);
        $public = $this->makePost($creator, Post::PUBLIC);
        $original = Storage::get($private->path);

        // The fan gets a stamped copy (a re-encoded JPEG), made once and then reused.
        $r = $this->actingAs($fan)->get(route('media.show', $private))->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        $stamped = $this->bytes($r);
        $this->assertNotSame($original, $stamped);
        $this->assertSame([1200, 800], array_slice(getimagesizefromstring($stamped), 0, 2));
        $this->assertCount(1, Storage::allFiles(Stamp::folder($private->path)));
        $this->get(route('media.show', $private));
        $this->assertCount(1, Storage::allFiles(Stamp::folder($private->path)));

        // The page tells the player what to overlay on videos, and tags the URL per viewer.
        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('posts', function ($posts) use ($private, $public, $fan) {
            $media = fn ($id) => collect($posts)->firstWhere('id', $id)['media'][0];

            return $media($private->post_id)['stamp'] === 'ID '.$fan->id
                && str_contains($media($private->post_id)['url'], 's='.Stamp::urlTag($fan))
                && $media($public->post_id)['stamp'] === null;
        }));

        // Free posts and the creator's own view are the untouched original.
        $this->assertSame(Storage::get($public->path), $this->bytes($this->get(route('media.show', $public))));
        $this->assertSame($original, $this->bytes($this->actingAs($creator->user)->get(route('media.show', $private))));

        // Deleting the post removes its stamped copies too.
        $this->delete(route('studio.posts.destroy', $private->post_id));
        $this->assertFalse(Storage::exists(Stamp::folder($private->path)));
    }

    public function test_message_photos_are_stamped_for_the_recipient_only(): void
    {
        $creator = $this->creator();
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $message = Conversation::between($creator->user, $fan)->messages()->create(['sender_id' => $creator->user_id, 'body' => 'hi']);
        $media = $message->media()->create(['type' => 'image', 'path' => $this->photo(), 'mime' => 'image/jpeg', 'position' => 0]);
        $original = Storage::get($media->path);

        $this->assertNotSame($original, $this->bytes($this->actingAs($fan)->get(route('messages.media', $media))->assertOk()));
        $this->assertSame($original, $this->bytes($this->actingAs($creator->user)->get(route('messages.media', $media))));
    }

    public function test_old_copies_are_pruned(): void
    {
        Storage::put('stamped/abc/old.jpg', 'x');
        Storage::put('stamped/def/new.jpg', 'x');
        touch(Storage::path('stamped/abc/old.jpg'), now()->subDays(10)->getTimestamp());

        $this->artisan('media:prune-stamps')->assertSuccessful();

        $this->assertFalse(Storage::exists('stamped/abc'));
        $this->assertTrue(Storage::exists('stamped/def/new.jpg'));
    }
}
