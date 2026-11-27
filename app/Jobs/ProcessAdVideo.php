<?php

namespace App\Jobs;

use App\Media\Ffmpeg;
use App\Media\Paths;
use App\Models\Ad;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * A video banner, made fit for the column: converted to a small web MP4 (App\Media\Ffmpeg::toWeb, so it starts at
 * once and plays on every phone) with a still to show before it plays. Banners are public, so both live on the
 * public disk. Without ffmpeg the upload is kept as it is (and shows without a still).
 */
class ProcessAdVideo implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 1800;

    public function __construct(public int $adId)
    {
        $this->onConnection('media');
        $this->onQueue('media');
    }

    public function handle(Ffmpeg $ffmpeg): void
    {
        $ad = Ad::find($this->adId);
        if (! $ad?->video_path || Paths::isWeb($ad->video_path) || ! $ffmpeg->available()) {
            return;
        }
        $disk = Storage::disk('public');
        $source = $disk->path($ad->video_path);
        if (! is_file($source)) {
            return;
        }

        $work = Storage::disk('local')->path('transcode/ad-'.Str::random(16));
        File::ensureDirectoryExists($work);
        try {
            $probe = $ffmpeg->probe($source);
            $ffmpeg->toWeb($source, "{$work}/web.mp4", $probe);
            $web = $ffmpeg->probe("{$work}/web.mp4");
            $ffmpeg->frame("{$work}/web.mp4", "{$work}/poster.jpg", min(1.0, $web['duration'] * 0.1), 1200);

            $video = Paths::web($ad->video_path);
            $poster = Paths::poster($video);
            $disk->putFileAs(dirname($video), new \Illuminate\Http\File("{$work}/web.mp4"), basename($video));
            $disk->putFileAs(dirname($poster), new \Illuminate\Http\File("{$work}/poster.jpg"), basename($poster));

            $fresh = Ad::find($this->adId);
            if (! $fresh || $fresh->video_path !== $ad->video_path) {
                $disk->delete([$video, $poster]); // deleted or replaced meanwhile

                return;
            }
            $fresh->update(['video_path' => $video, 'poster_path' => $poster]);
            $disk->delete($ad->video_path);
        } catch (\Throwable $e) {
            Log::warning('Could not convert a video banner; it is shown as uploaded.', ['ad' => $this->adId, 'error' => $e->getMessage()]);
        } finally {
            File::deleteDirectory($work);
        }
    }
}
