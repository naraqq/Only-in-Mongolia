<?php

namespace Tests\Feature;

use App\Media\ChunkedUploads;
use App\Models\CreatorProfile;
use App\Models\MediaUpload;
use App\Models\Post;
use App\Models\PostMedia;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** Big videos go up in pieces before the post is published, so no request ever hits the server's size limit. */
class ChunkedUploadTest extends TestCase
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

    /** Bytes that read as a real MP4 (an ftyp box), padded to $size. */
    private function mp4(int $size): string
    {
        $head = "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom";

        return $head.str_repeat("\x00", $size - strlen($head));
    }

    private function sendChunk(string $id, int $index, string $bytes): TestResponse
    {
        return $this->call('POST', "/uploads/{$id}/chunks/{$index}", [], [], [], ['CONTENT_TYPE' => 'application/octet-stream', 'HTTP_ACCEPT' => 'application/json'], $bytes);
    }

    /** Start an upload and send every piece; returns the upload id. */
    private function upload(string $bytes, string $name = 'clip.mp4', string $mime = 'video/mp4'): string
    {
        $start = $this->postJson('/uploads', ['name' => $name, 'size' => strlen($bytes), 'mime' => $mime])->assertCreated();
        $id = $start->json('id');
        foreach (str_split($bytes, $start->json('chunk_size')) as $i => $piece) {
            $this->sendChunk($id, $i, $piece)->assertNoContent();
        }

        return $id;
    }

    public function test_a_video_sent_in_pieces_is_joined_checked_and_published(): void
    {
        $creator = $this->creator();
        $this->actingAs($creator->user);
        $bytes = $this->mp4((int) (ChunkedUploads::chunkSize() * 2.5)); // three pieces, the last one shorter

        $id = $this->upload($bytes);
        $this->assertCount(3, Storage::disk('local')->files("chunked/{$id}"));
        $this->postJson("/uploads/{$id}/complete")->assertOk()->assertJson(['id' => $id, 'type' => 'video', 'mime' => 'video/mp4']);
        $this->postJson("/uploads/{$id}/complete")->assertOk(); // a retried request gets the same answer

        $upload = MediaUpload::sole();
        Storage::disk('local')->assertExists($upload->path);
        $this->assertSame(hash('sha256', $bytes), $upload->sha256);
        $this->assertSame(strlen($bytes), Storage::disk('local')->size($upload->path));
        Storage::disk('local')->assertMissing("chunked/{$id}"); // pieces gone once joined

        $this->post('/studio/posts', ['body' => 'New video', 'visibility' => Post::PUBLIC, 'uploads' => [$id]])->assertSessionHasNoErrors();

        $media = PostMedia::sole();
        $this->assertSame(['video', 'video/mp4', $upload->path], [$media->type, $media->mime, $media->path]);
        $this->assertSame($upload->path, $creator->vaultItems()->sole()->path); // joins the library like any upload
        $this->assertNotNull($upload->fresh()->attached_at);

        // Can't be used twice.
        $this->post('/studio/posts', ['body' => 'Again', 'visibility' => Post::PUBLIC, 'uploads' => [$id]])->assertSessionHasErrors('uploads');
    }

    public function test_pieces_can_arrive_out_of_order_and_an_interrupted_upload_resumes(): void
    {
        $this->actingAs($this->creator()->user);
        $bytes = $this->mp4(ChunkedUploads::chunkSize() * 3);
        $id = $this->postJson('/uploads', ['name' => 'clip.mp4', 'size' => strlen($bytes), 'mime' => 'video/mp4'])->json('id');
        $pieces = str_split($bytes, ChunkedUploads::chunkSize());

        $this->sendChunk($id, 2, $pieces[2])->assertNoContent();
        $this->sendChunk($id, 0, substr($pieces[0], 0, 100))->assertStatus(422); // cut short: rejected, not kept
        $this->getJson("/uploads/{$id}")->assertJson(['received' => [2], 'completed' => false]);

        $this->postJson("/uploads/{$id}/complete")->assertStatus(409)->assertJson(['missing' => [0, 1]]);

        $this->sendChunk($id, 0, $pieces[0])->assertNoContent();
        $this->sendChunk($id, 1, $pieces[1])->assertNoContent();
        $this->sendChunk($id, 1, $pieces[1])->assertNoContent(); // a retry of a piece that made it is fine
        $this->postJson("/uploads/{$id}/complete")->assertOk();
        $this->assertSame(hash('sha256', $bytes), MediaUpload::sole()->sha256);
    }

    public function test_long_videos_are_allowed_but_not_unlimited_and_only_media_types(): void
    {
        $this->actingAs($this->creator()->user);

        $this->postJson('/uploads', ['name' => 'film.mp4', 'size' => 1500 * 1024 * 1024, 'mime' => 'video/mp4'])->assertCreated(); // 1.5 GB
        $this->postJson('/uploads', ['name' => 'huge.mp4', 'size' => 3 * 1024 ** 3, 'mime' => 'video/mp4'])->assertJsonValidationErrors('file');
        $this->postJson('/uploads', ['name' => 'big.jpg', 'size' => 30 * 1024 * 1024, 'mime' => 'image/jpeg'])->assertJsonValidationErrors('file');
        $this->postJson('/uploads', ['name' => 'app.exe', 'size' => 1000, 'mime' => 'application/x-msdownload'])->assertJsonValidationErrors('file');
    }

    public function test_a_file_that_is_not_really_a_video_is_thrown_away(): void
    {
        $this->actingAs($this->creator()->user);
        $id = $this->upload("<?php echo 'not a video';\n".str_repeat('x', 5000)); // claims to be clip.mp4

        $this->postJson("/uploads/{$id}/complete")->assertJsonValidationErrors('file');
        $this->assertSame(0, MediaUpload::count());
        Storage::disk('local')->assertMissing("chunked/{$id}");
    }

    public function test_blocked_files_are_refused_when_finished(): void
    {
        $this->actingAs($this->creator()->user);
        $bytes = $this->mp4(5000);
        DB::table('media_blocklist')->insert(['sha256' => hash('sha256', $bytes), 'reason' => 'csam', 'created_at' => now(), 'updated_at' => now()]);

        $id = $this->upload($bytes);
        $this->postJson("/uploads/{$id}/complete")->assertJsonValidationErrors('file.0'); // says nothing about why
        $this->assertSame(0, MediaUpload::count());
    }

    public function test_uploads_are_private_to_whoever_started_them(): void
    {
        $this->actingAs($this->creator()->user);
        $id = $this->upload($this->mp4(5000));
        $this->postJson("/uploads/{$id}/complete")->assertOk();

        $other = $this->creator('other');
        $this->actingAs($other->user);
        $this->getJson("/uploads/{$id}")->assertNotFound();
        $this->sendChunk($id, 0, 'x')->assertNotFound();
        $this->deleteJson("/uploads/{$id}")->assertNotFound();
        $this->post('/studio/posts', ['body' => 'Stolen', 'visibility' => Post::PUBLIC, 'uploads' => [$id]])->assertSessionHasErrors('uploads');
        $this->assertSame(0, PostMedia::count());

        // Fans who aren't creators can't start one.
        $this->actingAs(User::factory()->create(['birthdate' => '1990-01-01']))->postJson('/uploads', ['name' => 'a.mp4', 'size' => 10, 'mime' => 'video/mp4'])->assertForbidden();
    }

    public function test_a_cancelled_upload_is_removed_and_forgotten_ones_are_pruned(): void
    {
        $this->actingAs($this->creator()->user);
        $cancelled = $this->upload($this->mp4(5000));
        $this->deleteJson("/uploads/{$cancelled}")->assertNoContent();
        Storage::disk('local')->assertMissing("chunked/{$cancelled}");

        $unfinished = $this->postJson('/uploads', ['name' => 'a.mp4', 'size' => 5000, 'mime' => 'video/mp4'])->json('id');
        $this->sendChunk($unfinished, 0, substr($this->mp4(5000), 0, 5000));
        $finished = $this->upload($this->mp4(6000));
        $this->postJson("/uploads/{$finished}/complete")->assertOk();
        $path = MediaUpload::find($finished)->path;

        $this->travel(2)->hours();
        $this->artisan('media:prune-uploads', ['--hours' => 24])->assertSuccessful();
        $this->assertSame(2, MediaUpload::count()); // still fresh

        $this->travel(1)->days();
        $this->artisan('media:prune-uploads')->assertSuccessful();
        $this->assertSame(0, MediaUpload::count());
        Storage::disk('local')->assertMissing($path);
        Storage::disk('local')->assertMissing("chunked/{$unfinished}");
    }
}
