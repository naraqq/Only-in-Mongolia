<?php

namespace Tests\Feature;

use App\Jobs\RetireOriginalVideo;
use App\Jobs\TranscodeVideo;
use App\Media\Ffmpeg;
use App\Media\Paths;
use App\Media\Previews;
use App\Media\Transcoding;
use App\Models\CreatorProfile;
use App\Models\MediaPreview;
use App\Models\MediaUpload;
use App\Models\Post;
use App\Models\PostMedia;
use App\Models\User;
use App\Models\VaultItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Uploaded videos are converted once for the web, get their frames, and every use switches to the new file. */
class VideoTranscodingTest extends TestCase
{
    use RefreshDatabase;

    private FakeFfmpeg $ffmpeg;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config(['media.transcode' => true, 'media.video_max_side' => 1280, 'media.video_max_kbps' => 4000]);
        $this->ffmpeg = new FakeFfmpeg;
        $this->app->instance(Ffmpeg::class, $this->ffmpeg);
    }

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ9501'.random_int(1000, 9999), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000'.random_int(10000, 99999), 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    /** A posted video at $path (also in the creator's library). */
    private function postedVideo(string $path, string $mime = 'video/quicktime'): PostMedia
    {
        Storage::disk('local')->put($path, 'original video bytes');
        $creator = $this->creator();
        $post = $creator->posts()->create(['body' => 'Clip', 'visibility' => Post::PUBLIC]);
        $creator->vaultItems()->create(['type' => 'video', 'path' => $path, 'mime' => $mime]);

        return $post->media()->create(['type' => 'video', 'path' => $path, 'mime' => $mime, 'position' => 0, 'scan_status' => 'ok']);
    }

    public function test_a_phone_video_is_converted_and_every_use_switches_to_it(): void
    {
        Queue::fake([RetireOriginalVideo::class]);
        $path = 'users/1/posts/2026/11/clip.mov';
        $media = $this->postedVideo($path);
        $this->ffmpeg->source = ['vcodec' => 'hevc', 'width' => 2160, 'height' => 3840, 'kbps' => 20000, 'format' => 'mov,mp4,m4a,3gp,3g2,mj2'];

        (new TranscodeVideo($path))->handle($this->ffmpeg);

        $web = 'users/1/posts/2026/11/clip.web.mp4';
        $this->assertSame([$path], $this->ffmpeg->converted);
        $this->assertSame(['path' => $web, 'mime' => 'video/mp4'], $media->fresh()->only(['path', 'mime']));
        $this->assertSame($web, VaultItem::sole()->path);
        Storage::disk('local')->assertExists($web);

        // Frames made here, since the browser sent none.
        $preview = MediaPreview::where('path', $web)->sole();
        $this->assertSame(Paths::poster($web), $preview->poster_path);
        $this->assertEquals(Previews::grid(30.0, 720, 1280), $preview->thumbs);
        Storage::disk('local')->assertExists([Paths::poster($web), Paths::thumbs($web)]);

        // The original stays a few minutes (for requests that read the old path just before), then goes.
        Storage::disk('local')->assertExists($path);
        Queue::assertPushed(RetireOriginalVideo::class, fn ($job) => $job->original === $path && $job->web === $web);
        (new RetireOriginalVideo($path, $web))->handle();
        Storage::disk('local')->assertMissing($path);
    }

    public function test_a_post_published_with_the_old_path_during_the_switch_is_moved_over_before_the_original_goes(): void
    {
        Queue::fake([RetireOriginalVideo::class]);
        $path = 'users/1/posts/2026/11/clip.mov';
        $this->postedVideo($path);
        (new TranscodeVideo($path))->handle($this->ffmpeg);

        $late = Post::sole()->media()->create(['type' => 'video', 'path' => $path, 'mime' => 'video/quicktime', 'position' => 1]);
        (new RetireOriginalVideo($path, Paths::web($path)))->handle();

        $this->assertSame(Paths::web($path), $late->fresh()->path);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_a_video_that_already_plays_everywhere_is_kept_and_only_gets_frames(): void
    {
        $path = 'users/1/posts/2026/11/clip.mp4';
        $media = $this->postedVideo($path, 'video/mp4');
        // An MP4 whose index comes first.
        Storage::disk('local')->put($path, pack('N', 16).'ftypisom'.str_repeat("\0", 4).pack('N', 8).'moov'.pack('N', 8).'mdat');
        $this->ffmpeg->source = ['vcodec' => 'h264', 'width' => 1280, 'height' => 720, 'kbps' => 2500, 'format' => 'mov,mp4,m4a,3gp,3g2,mj2'];

        (new TranscodeVideo($path))->handle($this->ffmpeg);

        $this->assertSame([], $this->ffmpeg->converted);
        $this->assertSame($path, $media->fresh()->path);
        $this->assertNotNull(MediaPreview::where('path', $path)->value('poster_path'));
    }

    public function test_an_mp4_with_its_index_at_the_end_is_converted(): void
    {
        $path = 'users/1/posts/2026/11/clip.mp4';
        $this->postedVideo($path, 'video/mp4');
        Storage::disk('local')->put($path, pack('N', 16).'ftypisom'.str_repeat("\0", 4).pack('N', 8).'mdat'.pack('N', 8).'moov');
        $this->ffmpeg->source = ['vcodec' => 'h264', 'width' => 1280, 'height' => 720, 'kbps' => 2500, 'format' => 'mov,mp4,m4a,3gp,3g2,mj2'];

        (new TranscodeVideo($path))->handle($this->ffmpeg);

        $this->assertSame([$path], $this->ffmpeg->converted);
    }

    public function test_frames_the_uploaders_browser_sent_are_kept(): void
    {
        Queue::fake([RetireOriginalVideo::class]);
        $path = 'users/1/posts/2026/11/clip.mov';
        $this->postedVideo($path);
        $grid = ['cols' => 2, 'count' => 2, 'interval' => 15.0, 'w' => 90, 'h' => 160];
        Previews::store($path, 'browser poster', 'browser tiles', $grid);

        (new TranscodeVideo($path))->handle($this->ffmpeg);

        $web = Paths::web($path);
        $preview = MediaPreview::sole();
        $this->assertSame($web, $preview->path); // moved along with the video
        $this->assertSame(0, $this->ffmpeg->framesMade);
        $this->assertSame('browser poster', Storage::disk('local')->get($preview->poster_path));
    }

    public function test_a_video_removed_before_its_turn_is_left_alone(): void
    {
        $path = 'users/1/posts/2026/11/gone.mov';
        (new TranscodeVideo($path))->handle($this->ffmpeg);
        $this->assertSame([], $this->ffmpeg->converted);

        // Stored, but its message isn't saved yet: try again later instead of converting a file nobody uses.
        Storage::disk('local')->put($path, 'x');
        $this->assertFalse(Transcoding::run($path, $this->ffmpeg));
    }

    public function test_an_upload_thrown_away_during_conversion_leaves_nothing_behind(): void
    {
        $path = 'users/1/posts/2026/11/clip.mov';
        Storage::disk('local')->put($path, 'bytes');
        $upload = MediaUpload::create(['user_id' => User::factory()->create()->id, 'name' => 'clip.mov', 'size' => 5, 'chunk_size' => 5, 'chunks' => 1, 'type' => 'video', 'mime' => 'video/quicktime', 'path' => $path, 'completed_at' => now()]);
        $this->ffmpeg->during = fn () => $upload->delete();

        (new TranscodeVideo($path))->handle($this->ffmpeg);

        Storage::disk('local')->assertMissing(Paths::web($path));
        $this->assertSame(0, MediaPreview::count());
    }

    public function test_longer_videos_also_stream_adaptively_behind_the_same_permission_check(): void
    {
        Queue::fake([RetireOriginalVideo::class]);
        $path = 'users/1/posts/2026/11/clip.mov';
        $media = $this->postedVideo($path);
        (new TranscodeVideo($path))->handle($this->ffmpeg);

        $web = Paths::web($path);
        $preview = MediaPreview::where('path', $web)->sole();
        $this->assertSame(Paths::hls($web).'/master.m3u8', $preview->hls_path);
        $this->assertSame([360, 540], $this->ffmpeg->hlsRungs); // below the converted 720p
        Storage::disk('local')->assertExists([Paths::hls($web).'/v0/seg_0000.m4s', Paths::hls($web).'/v2/index.m3u8']);
        $this->assertSame(route('media.hls', [$media, 'master.m3u8']), Previews::present($preview, fn ($w) => $w === 'hls' ? route('media.hls', [$media, 'master.m3u8']) : $w)['hls']);

        // Every file the playlists name comes back through the app (this server's disk; on R2 they're signed links).
        $master = $this->get(route('media.hls', [$media, 'master.m3u8']))->assertOk()->assertHeader('Content-Type', 'application/vnd.apple.mpegurl')->getContent();
        $this->assertStringContainsString(route('media.hls', [$media, 'v0/index.m3u8']), $master);
        $variant = $this->get(route('media.hls', [$media, 'v0/index.m3u8']))->assertOk()->getContent();
        $this->assertStringContainsString('URI="'.route('media.hls', [$media, 'v0/init_0.mp4']).'"', $variant);
        $this->assertStringContainsString(route('media.hls', [$media, 'v0/seg_0000.m4s']), $variant);
        $this->assertSame('piece 0', file_get_contents($this->get(route('media.hls', [$media, 'v0/seg_0000.m4s']))->assertOk()->getFile()->getPathname()));
        $this->get(route('media.hls', [$media, 'v0/../../secret.txt']))->assertNotFound();

        // Not for someone who may not watch the video.
        $media->post->update(['visibility' => Post::SUBSCRIBERS]);
        $this->get(route('media.hls', [$media, 'master.m3u8']))->assertForbidden();

        // Removed together with the video's frames.
        Previews::delete($web);
        Storage::disk('local')->assertMissing(Paths::hls($web).'/master.m3u8');
    }

    public function test_short_videos_play_as_one_file(): void
    {
        Queue::fake([RetireOriginalVideo::class]);
        config(['media.hls_min_seconds' => 60]); // the fake's videos are 30 s
        $path = 'users/1/posts/2026/11/clip.mov';
        $this->postedVideo($path);
        (new TranscodeVideo($path))->handle($this->ffmpeg);

        $this->assertNull($this->ffmpeg->hlsRungs);
        $this->assertNull(MediaPreview::where('path', Paths::web($path))->value('hls_path'));
    }

    public function test_finishing_a_pieced_video_upload_queues_its_conversion(): void
    {
        Queue::fake();
        $this->actingAs($this->creator()->user);
        $bytes = "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom".str_repeat("\x00", 4000);
        $id = $this->postJson('/uploads', ['name' => 'clip.mp4', 'size' => strlen($bytes), 'mime' => 'video/mp4'])->json('id');
        $this->call('POST', "/uploads/{$id}/chunks/0", [], [], [], ['CONTENT_TYPE' => 'application/octet-stream'], $bytes)->assertNoContent();
        $this->postJson("/uploads/{$id}/complete")->assertOk();

        Queue::assertPushed(TranscodeVideo::class, fn ($job) => $job->path === MediaUpload::find($id)->path && $job->connection === 'media');
    }

    public function test_nothing_happens_without_ffmpeg(): void
    {
        $path = 'users/1/posts/2026/11/clip.mov';
        $media = $this->postedVideo($path);
        $this->ffmpeg->installed = false;

        (new TranscodeVideo($path))->handle($this->ffmpeg);

        $this->assertSame($path, $media->fresh()->path);
    }
}

/** Stands in for ffmpeg: "converts" by copying, and makes plain JPEGs of the right size. */
class FakeFfmpeg extends Ffmpeg
{
    public bool $installed = true;

    /** What probe() says about the uploaded file. */
    public array $source = ['vcodec' => 'hevc', 'width' => 1080, 'height' => 1920, 'kbps' => 9000, 'format' => 'mov,mp4,m4a,3gp,3g2,mj2'];

    public array $converted = [];

    public int $framesMade = 0;

    public ?\Closure $during = null;

    public function available(): bool
    {
        return $this->installed;
    }

    public function probe(string $file): array
    {
        $web = str_ends_with($file, 'web.mp4');

        return [
            'duration' => 30.0, 'acodec' => 'aac', 'pix_fmt' => 'yuv420p', 'transfer' => 'bt709',
            ...($web ? ['vcodec' => 'h264', 'width' => 720, 'height' => 1280, 'kbps' => 900, 'format' => 'mov,mp4,m4a,3gp,3g2,mj2'] : $this->source),
        ];
    }

    public function toWeb(string $in, string $out, array $probe): void
    {
        $this->converted[] = str_replace('\\', '/', substr($in, strpos(str_replace('\\', '/', $in), 'users/')));
        copy($in, $out);
        if ($this->during) {
            ($this->during)();
        }
    }

    public function frame(string $in, string $out, float $seconds, int $side): void
    {
        $this->framesMade++;
        imagejpeg(imagecreatetruecolor(72, 128), $out);
    }

    public function tiles(string $in, string $out, array $grid): void
    {
        $this->framesMade++;
        imagejpeg(imagecreatetruecolor($grid['cols'] * $grid['w'], (int) ceil($grid['count'] / $grid['cols']) * $grid['h']), $out);
    }

    public ?array $hlsRungs = null;

    /** Playlists and one piece per quality, laid out like ffmpeg's. */
    public function hls(string $in, string $dir, array $probe, array $rungs): void
    {
        $this->hlsRungs = $rungs;
        $variants = '';
        foreach ([...$rungs, 'top'] as $i => $r) {
            @mkdir("{$dir}/v{$i}", 0777, true);
            file_put_contents("{$dir}/v{$i}/index.m3u8", "#EXTM3U
#EXT-X-MAP:URI=\"init_{$i}.mp4\"
#EXTINF:4.000000,
seg_0000.m4s
#EXT-X-ENDLIST
");
            file_put_contents("{$dir}/v{$i}/init_{$i}.mp4", 'init');
            file_put_contents("{$dir}/v{$i}/seg_0000.m4s", "piece {$i}");
            $variants .= "#EXT-X-STREAM-INF:BANDWIDTH=500000
v{$i}/index.m3u8
";
        }
        file_put_contents("{$dir}/master.m3u8", "#EXTM3U
{$variants}");
    }
}
