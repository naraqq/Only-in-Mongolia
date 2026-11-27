<?php

namespace App\Media;

use App\Jobs\RetireOriginalVideo;
use App\Jobs\TranscodeVideo;
use App\Models\MediaPreview;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Uploaded videos, made fit for the web once, in the background (on the "media" queue):
 *
 * - Converted to an MP4 every browser and phone plays (App\Media\Ffmpeg::toWeb): an iPhone's 4K HEVC .mov becomes
 *   a 720p H.264 file a fraction of the size that starts playing at once, also on a slow connection.
 * - Given a still frame and seek-bar frames (App\Media\Previews), unless the uploader's browser already sent them.
 *
 * The converted file goes next to the original ({name}.web.mp4) and every post, message, library item and upload
 * using the original is switched to it in one transaction. The original is removed a few minutes later
 * (App\Jobs\RetireOriginalVideo), so a request that read the old path just before the switch still finds it.
 * Videos that already play everywhere (small H.264 MP4s) are left as they are and only get their frames.
 */
class Transcoding
{
    /** Tables that point at stored files. The upload goes first: it's the row a publishing post locks. */
    private const TABLES = ['media_uploads', 'vault_items', 'post_media', 'message_media'];

    /** Convert the video at $path in the background (no-op for other files, or when switched off). */
    public static function queue(string $path, ?string $type = 'video'): void
    {
        if ($type === 'video' && config('media.transcode') && ! Paths::isWeb($path)) {
            TranscodeVideo::dispatch($path);
        }
    }

    /**
     * Returns false when the file exists but nothing points at it yet (stored a moment before its message or
     * library item is saved): the job tries again shortly.
     */
    public static function run(string $path, Ffmpeg $ffmpeg): bool
    {
        if (! config('media.transcode') || ! $ffmpeg->available()) {
            Log::info('Video left as uploaded: ffmpeg is not available.', ['path' => $path]);

            return true;
        }
        if (! Files::exists($path)) {
            return true; // removed before its turn came
        }
        if (! self::inUse($path)) {
            return false;
        }

        $work = Storage::disk('local')->path('transcode/'.Str::random(20));
        File::ensureDirectoryExists($work);
        try {
            $source = self::fetch($path, $work);
            $probe = $ffmpeg->probe($source);
            $target = $path;
            $file = $source;

            if (self::needsConverting($path, $source, $probe)) {
                $file = "{$work}/web.mp4";
                $ffmpeg->toWeb($source, $file, $probe);
                $probe = $ffmpeg->probe($file);
                $target = Paths::web($path);
                Files::putFile($file, $target);
                if (! self::swap($path, $target)) {
                    Files::delete($target); // nothing uses the video any more

                    return true;
                }
                RetireOriginalVideo::dispatch($path, $target)->delay(now()->addMinutes(10));
            }

            try {
                self::previews($target, $file, $probe, $ffmpeg, $work);
            } catch (\Throwable $e) {
                // The video itself is fine; it just plays without a still or seek-bar frames.
                Log::warning('Could not make video frames.', ['path' => $target, 'error' => $e->getMessage()]);
            }
            try {
                Hls::make($target, $file, $probe, $ffmpeg, $work);
            } catch (\Throwable $e) {
                // It plays as the single MP4 instead.
                Log::warning('Could not make adaptive streaming.', ['path' => $target, 'error' => $e->getMessage()]);
            }
        } finally {
            File::deleteDirectory($work);
        }

        return true;
    }

    /**
     * Point everything that uses $from at $to (the converted file). False when nothing used $from any more.
     */
    public static function swap(string $from, string $to): bool
    {
        return DB::transaction(function () use ($from, $to) {
            $moved = 0;
            foreach (self::TABLES as $table) {
                $moved += DB::table($table)->where('path', $from)->update(['path' => $to, 'mime' => 'video/mp4', 'updated_at' => now()]);
            }
            if (! MediaPreview::where('path', $to)->exists()) {
                MediaPreview::where('path', $from)->update(['path' => $to]);
            }

            return $moved > 0;
        });
    }

    /** True while a post, message, library item or upload still uses the file. */
    public static function inUse(string $path): bool
    {
        foreach (self::TABLES as $table) {
            if (DB::table($table)->where('path', $path)->exists()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether a video needs converting to play well everywhere: H.264 8-bit 4:2:0 + AAC (or silent) in an MP4 with
     * its index first, normal colours, no bigger than the size limit and not wastefully large. Anything else does.
     */
    public static function needsConverting(string $path, string $file, array $probe): bool
    {
        if (Paths::isWeb($path)) {
            return false;
        }
        $plays = strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'mp4'
            && str_contains($probe['format'], 'mp4')
            && $probe['vcodec'] === 'h264'
            && $probe['pix_fmt'] === 'yuv420p'
            && in_array($probe['acodec'], ['aac', null], true)
            && ! in_array($probe['transfer'], ['arib-std-b67', 'smpte2084'], true)
            && max($probe['width'], $probe['height']) <= config('media.video_max_side')
            && $probe['kbps'] <= config('media.video_max_kbps') + 256;

        return ! ($plays && self::indexFirst($file));
    }

    /** True when the MP4's index (moov) comes before the picture data, so playback can start before it's all loaded. */
    public static function indexFirst(string $file): bool
    {
        $f = @fopen($file, 'rb');
        if (! $f) {
            return false;
        }
        try {
            $size = filesize($file);
            $pos = 0;
            while ($pos + 8 <= $size) {
                fseek($f, $pos);
                $head = fread($f, 16);
                if (strlen($head) < 8) {
                    return false;
                }
                $len = unpack('N', substr($head, 0, 4))[1];
                $type = substr($head, 4, 4);
                if ($len === 1 && strlen($head) === 16) {
                    $len = (int) (unpack('J', substr($head, 8, 8))[1]);
                }
                if ($type === 'moov') {
                    return true;
                }
                if ($type === 'mdat' || $len < 8) {
                    return false;
                }
                $pos += $len;
            }

            return false;
        } finally {
            fclose($f);
        }
    }

    /** A path on this server's disk to read the video from (a download when it's in the bucket). */
    private static function fetch(string $path, string $work): string
    {
        if (! Files::remote($path)) {
            return Files::disk($path)->path($path);
        }
        $local = "{$work}/source.".(pathinfo($path, PATHINFO_EXTENSION) ?: 'bin');
        $in = Files::disk($path)->readStream($path);
        $out = fopen($local, 'wb');
        stream_copy_to_stream($in, $out);
        fclose($out);
        is_resource($in) && fclose($in);

        return $local;
    }

    /** Make the still and seek-bar frames, unless the uploader's browser already sent a full set. */
    private static function previews(string $target, string $file, array $probe, Ffmpeg $ffmpeg, string $work): void
    {
        $existing = MediaPreview::where('path', $target)->first();
        $short = $probe['duration'] < 4;
        if ($existing?->poster_path && ($existing->thumbs_path || $short)) {
            return;
        }
        if ($probe['duration'] <= 0 || ! $probe['width'] || ! $probe['height']) {
            return;
        }

        $poster = "{$work}/poster.jpg";
        $ffmpeg->frame($file, $poster, min(1.5, $probe['duration'] * 0.1), 1280);
        $tiles = null;
        $grid = null;
        if (! $short) {
            $grid = Previews::grid($probe['duration'], $probe['width'], $probe['height']);
            $ffmpeg->tiles($file, $tiles = "{$work}/thumbs.jpg", $grid);
        }
        Previews::store($target, (string) file_get_contents($poster), $tiles ? (string) file_get_contents($tiles) : null, $grid, [
            'width' => $probe['width'], 'height' => $probe['height'], 'duration' => $probe['duration'],
        ]);
    }
}
