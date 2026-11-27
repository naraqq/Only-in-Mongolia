<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Media on a bucket (Cloudflare R2): uploads go there, viewers get short signed links after the permission check. */
class R2MediaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Storage::fake('r2'); // still configured as an s3 disk, so the app treats it as a bucket
        Storage::disk('r2')->buildTemporaryUrlsUsing(fn ($path, $expires) => 'https://r2.example/'.$path.'?sig=test&exp='.$expires->getTimestamp());
        config(['filesystems.media_disk' => 'r2']);
    }

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    private function postWithPhoto(CreatorProfile $creator, string $visibility)
    {
        $this->actingAs($creator->user)->post('/studio/posts', [
            'body' => 'Hi', 'visibility' => $visibility, 'media' => [UploadedFile::fake()->image('p.jpg', 400, 300)],
        ])->assertSessionHasNoErrors();

        return Post::latest('id')->firstOrFail()->media()->firstOrFail();
    }

    public function test_uploads_go_to_the_bucket_and_viewers_get_a_short_signed_link(): void
    {
        $media = $this->postWithPhoto($this->creator(), Post::PUBLIC);

        Storage::disk('r2')->assertExists($media->path);
        Storage::disk('local')->assertMissing($media->path); // nothing kept on this server

        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $response = $this->actingAs($fan)->get("/media/{$media->id}");
        $response->assertRedirect();
        $this->assertStringStartsWith('https://r2.example/'.$media->path.'?sig=test', $response->headers->get('Location'));
        $this->assertLessThanOrEqual(now()->addMinutes(10)->getTimestamp(), (int) (string) str($response->headers->get('Location'))->after('exp='));
    }

    public function test_no_link_without_permission(): void
    {
        $media = $this->postWithPhoto($this->creator(), Post::SUBSCRIBERS);

        $this->actingAs(User::factory()->create(['birthdate' => '1990-01-01']))->get("/media/{$media->id}")->assertForbidden();
    }

    public function test_stamped_photos_are_made_on_this_server_from_the_bucket_copy(): void
    {
        $creator = $this->creator();
        $media = $this->postWithPhoto($creator, Post::SUBSCRIBERS);
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addMonth()]);

        $this->actingAs($fan)->get("/media/{$media->id}")->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        Storage::disk('local')->assertExists('media-cache/'.$media->path); // downloaded once for stamping
    }

    public function test_media_copy_moves_existing_files_to_the_bucket_and_can_run_again(): void
    {
        Storage::disk('local')->put('posts/1/a.jpg', 'photo');
        Storage::disk('local')->put('creator-ids/1/id.jpg', 'id');
        Storage::disk('local')->put('stamped/x/y.jpg', 'not media');

        $this->artisan('media:copy', ['--to' => 'r2'])->expectsOutputToContain('Copied 2 files')->assertSuccessful();
        Storage::disk('r2')->assertExists(['posts/1/a.jpg', 'creator-ids/1/id.jpg']);
        Storage::disk('r2')->assertMissing('stamped/x/y.jpg');

        $this->artisan('media:copy', ['--to' => 'r2'])->expectsOutputToContain('Copied 0 files (0.0 MB), 2 already there')->assertSuccessful();
    }
}
