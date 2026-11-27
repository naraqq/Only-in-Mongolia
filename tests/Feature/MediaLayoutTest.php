<?php

namespace Tests\Feature;

use App\Media\ChunkedUploads;
use App\Media\Library;
use App\Media\Paths;
use App\Models\CreatorProfile;
use App\Models\MediaPreview;
use App\Models\MediaUpload;
use App\Models\Post;
use App\Models\PostMedia;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Every upload lands under users/{id}/{purpose}/{yyyy}/{mm}/, ID documents under kyc/{id}/, and videos get previews. */
class MediaLayoutTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function creator(string $handle = 'artist'): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ9501'.random_int(1000, 9999), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000'.random_int(10000, 99999), 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    private function mp4(int $size): string
    {
        $head = "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom";

        return $head.str_repeat("\x00", $size - strlen($head));
    }

    /** A finished pieced video upload by the acting creator; returns its id. */
    private function videoUpload(): string
    {
        $bytes = $this->mp4(4096);
        $id = $this->postJson('/uploads', ['name' => 'clip.mp4', 'size' => strlen($bytes), 'mime' => 'video/mp4'])->assertCreated()->json('id');
        $this->call('POST', "/uploads/{$id}/chunks/0", [], [], [], ['CONTENT_TYPE' => 'application/octet-stream', 'HTTP_ACCEPT' => 'application/json'], $bytes)->assertNoContent();
        $this->postJson("/uploads/{$id}/complete")->assertOk();

        return $id;
    }

    private function jpeg(int $w, int $h): UploadedFile
    {
        return UploadedFile::fake()->image('frame.jpg', $w, $h);
    }

    public function test_paths_follow_the_layout(): void
    {
        $this->travelTo('2026-11-27 10:00:00');
        $this->assertMatchesRegularExpression('#^users/7/posts/2026/11/[0-9a-z]{26}\.mp4$#', Paths::media(7, Paths::POSTS, 'mp4'));
        $this->assertMatchesRegularExpression('#^kyc/7/[0-9a-z]{26}-selfie\.jpg$#', Paths::kyc(7, 'selfie', 'jpg'));
        $this->assertSame('users/7/posts/2026/11/abc.poster.jpg', Paths::poster('users/7/posts/2026/11/abc.mp4'));
        $this->assertSame('users/7/posts/2026/11/abc.thumbs.jpg', Paths::thumbs('users/7/posts/2026/11/abc.mp4'));
        $this->assertSame('jpg', Paths::ext($this->jpeg(10, 10)));
    }

    public function test_post_uploads_and_pieced_uploads_go_under_the_creators_user_folder(): void
    {
        $creator = $this->creator();
        $this->actingAs($creator->user);
        $uid = $creator->user_id;

        $id = $this->videoUpload();
        $this->assertStringStartsWith("users/{$uid}/posts/".now()->format('Y/m').'/', MediaUpload::findOrFail($id)->path);

        $this->post('/studio/posts', ['body' => 'Hi', 'visibility' => Post::PUBLIC, 'media' => [$this->jpeg(40, 40)], 'uploads' => [$id]])->assertSessionHasNoErrors();
        foreach (PostMedia::all() as $m) {
            $this->assertMatchesRegularExpression("#^users/{$uid}/posts/\\d{4}/\\d{2}/[0-9a-z]{26}\\.(jpg|mp4)$#", $m->path);
            Storage::disk('local')->assertExists($m->path);
        }
    }

    public function test_a_videos_frames_are_stored_next_to_it_and_shown_only_to_who_may_watch(): void
    {
        $creator = $this->creator();
        $this->actingAs($creator->user);
        $id = $this->videoUpload();

        // 3 tiles of 160×90 in a grid of 2 columns: 320×180.
        $this->post("/uploads/{$id}/preview", [
            'poster' => $this->jpeg(1280, 720), 'thumbs' => $this->jpeg(320, 180),
            'cols' => 2, 'count' => 3, 'interval' => 2.5, 'w' => 160, 'h' => 90, 'width' => 1920, 'height' => 1080, 'duration' => 7.5,
        ], ['Accept' => 'application/json'])->assertNoContent();

        $path = MediaUpload::findOrFail($id)->path;
        $preview = MediaPreview::where('path', $path)->sole();
        $this->assertSame(Paths::poster($path), $preview->poster_path);
        Storage::disk('local')->assertExists([Paths::poster($path), Paths::thumbs($path)]);
        $this->assertEquals(['cols' => 2, 'count' => 3, 'interval' => 2.5, 'w' => 160, 'h' => 90], $preview->thumbs);

        $this->post('/studio/posts', ['body' => 'Subs only', 'visibility' => Post::SUBSCRIBERS, 'uploads' => [$id]])->assertSessionHasNoErrors();
        $media = PostMedia::sole();
        $this->get(route('media.preview', [$media, 'poster']))->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        $this->get(route('media.preview', [$media, 'thumbs']))->assertOk();

        // Someone who can't watch the video doesn't get its frames either.
        $this->actingAs(User::factory()->create(['birthdate' => '1990-01-01']));
        $this->get(route('media.preview', [$media, 'poster']))->assertForbidden();

        // Deleting the last use of the video removes its frames.
        Library::deleteUnused([]); // nothing given: nothing removed
        $media->post->delete();
        $creator->vaultItems()->delete();
        Library::deleteUnused([$path]);
        Storage::disk('local')->assertMissing([$path, Paths::poster($path), Paths::thumbs($path)]);
        $this->assertSame(0, MediaPreview::count());
    }

    public function test_frames_that_dont_match_their_grid_are_refused(): void
    {
        $this->actingAs($this->creator()->user);
        $id = $this->videoUpload();

        $this->post("/uploads/{$id}/preview", [
            'poster' => $this->jpeg(640, 360), 'thumbs' => $this->jpeg(500, 500),
            'cols' => 2, 'count' => 3, 'interval' => 2.5, 'w' => 160, 'h' => 90,
        ], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertSame(0, MediaPreview::count());
    }

    public function test_only_the_uploader_can_add_frames_and_only_to_a_finished_video(): void
    {
        $this->actingAs($this->creator()->user);
        $id = $this->videoUpload();

        $this->actingAs($this->creator('other')->user);
        $this->post("/uploads/{$id}/preview", ['poster' => $this->jpeg(64, 64)], ['Accept' => 'application/json'])->assertNotFound();

        $unfinished = $this->postJson('/uploads', ['name' => 'b.mp4', 'size' => 100, 'mime' => 'video/mp4'])->json('id');
        $this->post("/uploads/{$unfinished}/preview", ['poster' => $this->jpeg(64, 64)], ['Accept' => 'application/json'])->assertStatus(409);
    }

    public function test_discarding_an_unused_upload_removes_its_frames(): void
    {
        $this->actingAs($this->creator()->user);
        $id = $this->videoUpload();
        $this->post("/uploads/{$id}/preview", ['poster' => $this->jpeg(64, 64)], ['Accept' => 'application/json'])->assertNoContent();
        $path = MediaUpload::findOrFail($id)->path;

        ChunkedUploads::discard(MediaUpload::findOrFail($id));
        Storage::disk('local')->assertMissing([$path, Paths::poster($path)]);
        $this->assertSame(0, MediaPreview::count());
    }
}
