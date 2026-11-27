<?php

namespace Tests\Feature;

use App\Jobs\DeleteMovedFile;
use App\Jobs\TranscodeVideo;
use App\Media\Paths;
use App\Media\Previews;
use App\Models\CreatorProfile;
use App\Models\MediaPreview;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Files stored before the current layout move to users/{id}/… and kyc/{id}/…, with every use switched over. */
class MediaRelayoutTest extends TestCase
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
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'creator-ids/1/front.jpg', 'id_back_path' => 'creator-ids/1/back.jpg', 'selfie_path' => 'creator-ids/1/selfie.jpg',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    public function test_old_files_move_to_the_users_folder_and_the_old_copies_go_later(): void
    {
        Queue::fake();
        $disk = Storage::disk('local');
        $creator = $this->creator();
        foreach (['creator-ids/1/front.jpg', 'creator-ids/1/back.jpg', 'creator-ids/1/selfie.jpg'] as $doc) {
            $disk->put($doc, 'id');
        }
        $this->travelTo('2026-10-05 12:00:00');
        $disk->put('posts/1/photo.jpg', 'photo');
        $disk->put('uploads/1/clip.mov', 'video');
        $post = $creator->posts()->create(['body' => 'x', 'visibility' => Post::PUBLIC]);
        $photo = $post->media()->create(['type' => 'image', 'path' => 'posts/1/photo.jpg', 'mime' => 'image/jpeg', 'position' => 0]);
        $clip = $post->media()->create(['type' => 'video', 'path' => 'uploads/1/clip.mov', 'mime' => 'video/quicktime', 'position' => 1]);
        $creator->vaultItems()->create(['type' => 'image', 'path' => 'posts/1/photo.jpg', 'mime' => 'image/jpeg']);
        Previews::store('uploads/1/clip.mov', 'poster', null, null);
        $this->travelBack();

        $this->artisan('media:relayout --dry-run')->expectsOutputToContain('2 file(s) to move')->assertSuccessful();
        $this->assertSame('posts/1/photo.jpg', $photo->fresh()->path); // nothing moved

        $this->artisan('media:relayout --transcode')->assertSuccessful();
        $uid = $creator->user_id;
        $newPhoto = $photo->fresh()->path;
        $newClip = $clip->fresh()->path;
        $this->assertMatchesRegularExpression("#^users/{$uid}/posts/2026/10/[0-9a-z]{26}\\.jpg$#", $newPhoto); // the month it was uploaded
        $this->assertMatchesRegularExpression("#^users/{$uid}/posts/2026/10/[0-9a-z]{26}\\.mov$#", $newClip);
        $this->assertSame($newPhoto, $creator->vaultItems()->value('path')); // every use of the file
        $this->assertSame('photo', $disk->get($newPhoto));
        $preview = MediaPreview::sole();
        $this->assertSame([$newClip, Paths::poster($newClip)], [$preview->path, $preview->poster_path]);
        $disk->assertExists(Paths::poster($newClip));
        Queue::assertPushed(TranscodeVideo::class, fn ($job) => $job->path === $newClip);
        $this->assertMatchesRegularExpression("#^kyc/{$uid}/[0-9a-z]{26}-selfie\\.jpg$#", $creator->fresh()->selfie_path);

        // The old copies stay until the delayed clean-up runs.
        $disk->assertExists(['posts/1/photo.jpg', 'uploads/1/clip.mov', 'creator-ids/1/front.jpg']);
        Queue::assertPushed(DeleteMovedFile::class, 5);
        Queue::pushed(DeleteMovedFile::class)->each(fn (DeleteMovedFile $job) => $job->handle());
        $disk->assertMissing(['posts/1/photo.jpg', 'uploads/1/clip.mov', 'creator-ids/1/front.jpg', Paths::poster('uploads/1/clip.mov')]);

        // Running again finds nothing to do.
        $this->artisan('media:relayout')->expectsOutputToContain('0 file(s) to move')->assertSuccessful();
    }

    public function test_a_late_post_with_the_old_path_is_switched_before_the_old_copy_goes(): void
    {
        Queue::fake();
        $disk = Storage::disk('local');
        $creator = $this->creator();
        $disk->put('posts/1/photo.jpg', 'photo');
        $post = $creator->posts()->create(['body' => 'x', 'visibility' => Post::PUBLIC]);
        $post->media()->create(['type' => 'image', 'path' => 'posts/1/photo.jpg', 'mime' => 'image/jpeg', 'position' => 0]);
        $this->artisan('media:relayout')->assertSuccessful();
        $late = $post->media()->create(['type' => 'image', 'path' => 'posts/1/photo.jpg', 'mime' => 'image/jpeg', 'position' => 1]);

        Queue::pushed(DeleteMovedFile::class)->first()->handle();
        $this->assertTrue(str_starts_with($late->fresh()->path, 'users/'));
        $disk->assertMissing('posts/1/photo.jpg');
    }
}
