<?php

namespace App\Media;

use App\Models\MediaPreview;
use App\Moderation\Moderation;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * A video's still frame (shown before it plays, instead of loading the video to find one) and its seek-bar frames
 * (a grid of small frames in one image, shown above the pointer while scrubbing). Both are made in the uploader's
 * browser from the file they picked, so this server never needs a video decoder.
 *
 * They're stored next to the video (App\Media\Paths) and served only through the same permission check as the
 * video itself. Each image is decoded and re-encoded here, so only a plain JPEG of the expected size is ever kept.
 */
class Previews
{
    private const POSTER_MAX = 1920;

    private const THUMBS_MAX = 4096;

    /**
     * Keep the frames for the video at $videoPath, replacing any earlier ones.
     *
     * @param  array{cols: int, count: int, interval: float, w: int, h: int}|null  $grid  how the seek-bar frames are laid out
     * @param  array{width?: int|null, height?: int|null, duration?: float|null}  $meta
     */
    public static function save(string $videoPath, UploadedFile $poster, ?UploadedFile $thumbs, ?array $grid, array $meta = []): MediaPreview
    {
        Moderation::screen([$poster], 'poster'); // the blocklist applies to stills too
        $posterJpeg = self::reencode($poster, 'poster', self::POSTER_MAX, self::POSTER_MAX);

        $thumbsJpeg = null;
        if ($thumbs && $grid) {
            $rows = (int) ceil($grid['count'] / $grid['cols']);
            $thumbsJpeg = self::reencode($thumbs, 'thumbs', self::THUMBS_MAX, self::THUMBS_MAX, [$grid['cols'] * $grid['w'], $rows * $grid['h']]);
        }

        return self::store($videoPath, $posterJpeg, $thumbsJpeg, $grid, $meta);
    }

    /**
     * Keep frames that are already plain JPEGs of the right size (made on this server by App\Media\Transcoding),
     * replacing any earlier ones.
     *
     * @param  array{cols: int, count: int, interval: float, w: int, h: int}|null  $grid
     * @param  array{width?: int|null, height?: int|null, duration?: float|null}  $meta
     */
    public static function store(string $videoPath, string $posterJpeg, ?string $thumbsJpeg, ?array $grid, array $meta = []): MediaPreview
    {
        $preview = MediaPreview::firstOrNew(['path' => $videoPath]);
        $posterPath = Paths::poster($videoPath);
        $thumbsPath = $thumbsJpeg !== null && $grid ? Paths::thumbs($videoPath) : null;
        // Frames kept under an earlier name (from before the video was converted) go.
        $stale = array_diff(array_filter([$preview->poster_path, $preview->thumbs_path]), array_filter([$posterPath, $thumbsPath]));
        Files::put($posterPath, $posterJpeg);
        if ($thumbsPath) {
            Files::put($thumbsPath, $thumbsJpeg);
        }
        if ($stale) {
            Files::delete(array_values($stale));
        }

        $preview->fill([
            'poster_path' => $posterPath,
            'thumbs_path' => $thumbsPath,
            'thumbs' => $thumbsPath ? $grid : null,
            'width' => $meta['width'] ?? null,
            'height' => $meta['height'] ?? null,
            'duration' => $meta['duration'] ?? null,
        ])->save();

        return $preview;
    }

    /**
     * How a video's seek-bar frames are laid out: about one every 2 s, at most 100, each fitting 160×160, 10 per row.
     * The same numbers as the browser's (resources/js/lib/video-preview.ts gridFor).
     *
     * @return array{cols: int, count: int, interval: float, w: int, h: int}
     */
    public static function grid(float $duration, int $width, int $height): array
    {
        $count = max(1, min(100, (int) round($duration / 2)));
        $s = min(1, 160 / max($width, $height, 1));

        return [
            'cols' => min(10, $count),
            'count' => $count,
            'interval' => $duration / $count,
            'w' => max(16, (int) round($width * $s)),
            'h' => max(16, (int) round($height * $s)),
        ];
    }

    /** @param  iterable<string>  $paths  @return Collection<string, MediaPreview> keyed by video path */
    public static function forPaths(iterable $paths): Collection
    {
        $paths = collect($paths)->filter()->unique()->values();

        return $paths->isEmpty() ? collect() : MediaPreview::whereIn('path', $paths)->get()->keyBy('path');
    }

    /**
     * What the player needs: the still's link and the seek-bar frames' link and layout.
     *
     * @param  callable(string $which): string  $url  the link for 'poster' or 'thumbs', behind the permission check
     * @return array{poster: string|null, thumbs: array<string, mixed>|null, duration: float|null}
     */
    public static function present(?MediaPreview $preview, callable $url): array
    {
        if (! $preview?->poster_path) {
            return ['poster' => null, 'thumbs' => null, 'duration' => null];
        }

        return [
            'poster' => $url('poster'),
            'thumbs' => $preview->thumbs_path && $preview->thumbs ? ['url' => $url('thumbs'), ...$preview->thumbs] : null,
            'duration' => $preview->duration,
        ];
    }

    /** The stored path of a video's 'poster' or 'thumbs' image, or null. */
    public static function file(string $videoPath, string $which): ?string
    {
        $preview = MediaPreview::where('path', $videoPath)->first();

        return $which === 'thumbs' ? $preview?->thumbs_path : $preview?->poster_path;
    }

    /** Remove a video's frames (when the video itself is deleted). */
    public static function delete(string $videoPath): void
    {
        $preview = MediaPreview::where('path', $videoPath)->first();
        if ($preview) {
            Files::delete(array_filter([$preview->poster_path, $preview->thumbs_path]));
            $preview->delete();
        }
    }

    /**
     * Decode an uploaded image and encode it again as a JPEG: anything that isn't really an image (or hides extra
     * data) doesn't survive. $exact: the size it must be (the seek-bar grid), within a pixel.
     *
     * @param  array{0: int, 1: int}|null  $exact
     */
    private static function reencode(UploadedFile $file, string $field, int $maxW, int $maxH, ?array $exact = null): string
    {
        $bad = fn () => ValidationException::withMessages([$field => __('This file can’t be uploaded.')]);
        if (! in_array($file->getMimeType(), ['image/jpeg', 'image/webp', 'image/png'], true)) {
            throw $bad();
        }
        $info = @getimagesize($file->getRealPath());
        if (! $info || $info[0] < 1 || $info[1] < 1 || $info[0] > $maxW || $info[1] > $maxH) {
            throw $bad();
        }
        if ($exact && (abs($info[0] - $exact[0]) > 1 || abs($info[1] - $exact[1]) > 1)) {
            throw $bad();
        }
        $img = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));
        if (! $img) {
            throw $bad();
        }
        ob_start();
        imagejpeg($img, null, 80);
        imagedestroy($img);

        return (string) ob_get_clean();
    }
}
