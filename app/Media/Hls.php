<?php

namespace App\Media;

use App\Models\MediaPreview;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Symfony\Component\HttpFoundation\Response;

/**
 * Adaptive streaming (HLS) for longer videos: besides the converted MP4, the video in 4-second pieces at a few
 * qualities (360p, 540p and the converted one), so playback starts fast and the player steps quality up or down
 * with the viewer's connection. Stored in a {name}.hls/ folder next to the video (App\Media\Paths::hls).
 *
 * Playlists go through the app's permission check like the video itself. Inside them, each piece is a link:
 * on R2 a signed link straight to the bucket (valid one to two hours; the rewritten playlist is cached per hour,
 * so it isn't signed again for every viewer), on this server a link back through the same check.
 */
class Hls
{
    /** A piece or init file in a playlist folder: v0/seg_0001.m4s, v0/init_0.mp4, v0/index.m3u8, master.m3u8. */
    private const FILE = '#^(master\.m3u8|v\d{1,2}/(index\.m3u8|init_\d{1,2}\.mp4|seg_\d{1,6}\.m4s))$#';

    /** Make the qualities for the video at $target (already on the media disk) from the local copy $file. */
    public static function make(string $target, string $file, array $probe, Ffmpeg $ffmpeg, string $work): void
    {
        if (! config('media.hls') || $probe['duration'] < config('media.hls_min_seconds')) {
            return;
        }
        if (MediaPreview::where('path', $target)->whereNotNull('hls_path')->exists()) {
            return;
        }
        // Lower qualities below the video's own (by the shorter side); none to add → not worth the playlists.
        $short = min($probe['width'], $probe['height']);
        $rungs = array_values(array_filter([360, 540], fn (int $r) => $r <= $short - 60));
        if (! $rungs) {
            return;
        }
        $local = "{$work}/hls";
        File::ensureDirectoryExists($local);
        $ffmpeg->hls($file, $local, $probe, $rungs);

        $dir = Paths::hls($target);
        Files::putDirectory($local, $dir);
        $preview = MediaPreview::firstOrNew(['path' => $target]);
        $preview->fill([
            'hls_path' => "{$dir}/master.m3u8",
            'width' => $preview->width ?? $probe['width'],
            'height' => $preview->height ?? $probe['height'],
            'duration' => $preview->duration ?? $probe['duration'],
        ])->save();
    }

    /**
     * One file of a video's streaming folder, for someone already allowed to watch it.
     *
     * @param  callable(string $file): string  $route  the app's link to another file of the same folder
     */
    public static function respond(string $videoPath, string $file, callable $route): Response
    {
        abort_unless(preg_match(self::FILE, $file) === 1, 404);
        $master = MediaPreview::where('path', $videoPath)->value('hls_path');
        abort_unless($master, 404);
        $dir = dirname($master);
        $path = "{$dir}/{$file}";

        if (! str_ends_with($file, '.m3u8')) {
            abort_unless(Files::exists($path), 404);

            return Files::response($path, 'video/mp4', ['Cache-Control' => 'private, max-age=86400']);
        }

        $remote = Files::remote($path);
        // On R2 every link in the playlist is signed; the result is the same for everyone within the hour.
        $window = intdiv(now()->getTimestamp(), 3600);
        $build = function () use ($path, $file, $dir, $route, $remote, $window) {
            abort_unless(Files::exists($path), 404);
            $folder = str_contains($file, '/') ? dirname($file).'/' : '';
            $link = function (string $name) use ($folder, $dir, $route, $remote, $window): string {
                $relative = $folder.$name;
                if (str_ends_with($name, '.m3u8') || ! $remote) {
                    return $route($relative);
                }

                return Files::disk()->temporaryUrl("{$dir}/{$relative}", Carbon::createFromTimestamp(($window + 2) * 3600));
            };

            return self::rewrite((string) Files::disk($path)->get($path), $link);
        };
        $body = $remote ? Cache::remember("hls:{$path}:{$window}", 3600, $build) : $build();

        return response($body, 200, [
            'Content-Type' => 'application/vnd.apple.mpegurl',
            // Short: its signed links are good for at least an hour, so a cached copy never outlives them.
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** Every file a playlist names (lines, and EXT-X-MAP's URI), passed through $link. */
    public static function rewrite(string $playlist, callable $link): string
    {
        $lines = preg_split('/\r?\n/', $playlist);
        foreach ($lines as $i => $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            if (str_starts_with($line, '#EXT-X-MAP:')) {
                $lines[$i] = preg_replace_callback('/URI="([^"]+)"/', fn ($m) => 'URI="'.$link($m[1]).'"', $line);
            } elseif (! str_starts_with($line, '#')) {
                $lines[$i] = $link($line);
            }
        }

        return implode("\n", $lines);
    }
}
