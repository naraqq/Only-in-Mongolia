<?php

namespace App\Media;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * The few things done with ffmpeg: look inside a video, convert it for the web, and take frames from it.
 * One class, so tests can swap in a fake (there's no ffmpeg on CI).
 */
class Ffmpeg
{
    /** True when ffmpeg and ffprobe can be run (checked once an hour). */
    public function available(): bool
    {
        return Cache::remember('ffmpeg:available', 3600, function () {
            try {
                return Process::timeout(20)->run([config('media.ffmpeg'), '-hide_banner', '-version'])->successful()
                    && Process::timeout(20)->run([config('media.ffprobe'), '-hide_banner', '-version'])->successful();
            } catch (\Throwable) {
                return false;
            }
        });
    }

    /**
     * What's in a video file. Width and height are as shown (a phone video filmed upright is taller than wide).
     *
     * @return array{duration: float, width: int, height: int, vcodec: ?string, acodec: ?string, pix_fmt: ?string,
     *     transfer: ?string, kbps: int, format: string}
     */
    public function probe(string $file): array
    {
        $run = Process::timeout(120)->run([
            config('media.ffprobe'), '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', $file,
        ]);
        if (! $run->successful()) {
            throw new RuntimeException('ffprobe failed: '.trim($run->errorOutput()));
        }
        $info = json_decode($run->output(), true) ?: [];
        $streams = collect($info['streams'] ?? []);
        $video = $streams->firstWhere('codec_type', 'video');
        $audio = $streams->firstWhere('codec_type', 'audio');
        if (! $video) {
            throw new RuntimeException('No picture in this file.');
        }

        $w = (int) ($video['width'] ?? 0);
        $h = (int) ($video['height'] ?? 0);
        $side = collect($video['side_data_list'] ?? [])->first(fn ($d) => isset($d['rotation']));
        $rotation = (int) ($video['tags']['rotate'] ?? $side['rotation'] ?? 0);
        if (abs($rotation) % 180 === 90) {
            [$w, $h] = [$h, $w];
        }

        return [
            'duration' => (float) ($info['format']['duration'] ?? $video['duration'] ?? 0),
            'width' => $w,
            'height' => $h,
            'vcodec' => $video['codec_name'] ?? null,
            'acodec' => $audio['codec_name'] ?? null,
            'pix_fmt' => $video['pix_fmt'] ?? null,
            'transfer' => $video['color_transfer'] ?? null,
            'kbps' => (int) round(((int) ($info['format']['bit_rate'] ?? 0)) / 1000),
            'format' => (string) ($info['format']['format_name'] ?? ''),
        ];
    }

    /**
     * Convert to an MP4 for the web: H.264 (8-bit 4:2:0, which everything plays), AAC stereo, longest side at most
     * $maxSide, the index at the front (playback starts before the whole file arrives), and no metadata (phones
     * write where a video was filmed into it). HDR video from phones is mapped to normal colours.
     */
    public function toWeb(string $in, string $out, array $probe): void
    {
        $max = (int) config('media.video_max_side');
        // Keep the shape, never upscale, even sizes (H.264 needs them). Rotation is applied before this.
        $scale = "scale=w='if(gte(iw,ih),min({$max},iw),-2)':h='if(gte(iw,ih),-2,min({$max},ih))'";
        $hdr = in_array($probe['transfer'], ['arib-std-b67', 'smpte2084'], true);
        $tonemap = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';

        $attempts = $hdr ? ["{$tonemap},{$scale},format=yuv420p", "{$scale},format=yuv420p"] : ["{$scale},format=yuv420p"];
        $kbps = (int) config('media.video_max_kbps');
        $last = '';
        foreach ($attempts as $filters) {
            $run = Process::timeout((int) config('media.timeout'))->run([
                config('media.ffmpeg'), '-hide_banner', '-nostdin', '-y', '-i', $in,
                '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1',
                '-vf', $filters, '-fpsmax', '60',
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', (string) config('media.video_crf'),
                '-profile:v', 'high', '-maxrate', "{$kbps}k", '-bufsize', ($kbps * 2).'k',
                // A keyframe every 2 s: seeking lands quickly, and the seek-bar frames can be read from keyframes only.
                '-force_key_frames', 'expr:gte(t,n_forced*2)',
                '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
                '-movflags', '+faststart', $out,
            ]);
            if ($run->successful()) {
                return;
            }
            $last = trim(substr($run->errorOutput(), -800));
        }
        throw new RuntimeException('ffmpeg conversion failed: '.$last);
    }

    /** One frame at $seconds, scaled so its longer side is at most $side, as a JPEG. */
    public function frame(string $in, string $out, float $seconds, int $side): void
    {
        $run = Process::timeout(300)->run([
            config('media.ffmpeg'), '-hide_banner', '-nostdin', '-y', '-ss', sprintf('%.3f', $seconds), '-i', $in,
            '-frames:v', '1', '-vf', "scale=w='min({$side},iw)':h='min({$side},ih)':force_original_aspect_ratio=decrease", '-q:v', '3', $out,
        ]);
        if (! $run->successful()) {
            throw new RuntimeException('ffmpeg frame failed: '.trim(substr($run->errorOutput(), -500)));
        }
    }

    /**
     * Seek-bar frames: one every $grid['interval'] seconds, each w×h, laid out $grid['cols'] per row, as one JPEG.
     *
     * @param  array{cols: int, count: int, interval: float, w: int, h: int}  $grid
     */
    public function tiles(string $in, string $out, array $grid): void
    {
        $rows = (int) ceil($grid['count'] / $grid['cols']);
        // The middle of each stretch, like the browser makes them.
        $filters = sprintf('fps=fps=1/%.6f:start_time=%.6f,scale=%d:%d,tile=%dx%d', $grid['interval'], $grid['interval'] / 2, $grid['w'], $grid['h'], $grid['cols'], $rows);
        $run = Process::timeout((int) config('media.timeout'))->run([
            config('media.ffmpeg'), '-hide_banner', '-nostdin', '-y', '-skip_frame', 'nokey', '-i', $in,
            '-vf', $filters, '-frames:v', '1', '-q:v', '5', $out,
        ]);
        if (! $run->successful()) {
            throw new RuntimeException('ffmpeg tiles failed: '.trim(substr($run->errorOutput(), -500)));
        }
    }
}
