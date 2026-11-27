<?php

namespace App\Ads;

use App\Jobs\ProcessAdVideo;
use App\Media\Ffmpeg;
use App\Models\Ad;
use App\Support\Images;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * A banner's picture or video, the same for companies' campaigns and admins' own banners: a picture is cropped to
 * the banner's 6:5 shape; a video is kept as uploaded until App\Jobs\ProcessAdVideo has made the web version and
 * its still. Banners are public, so they live on the public disk.
 */
class BannerMedia
{
    /** Stored at twice the 600×500 shown, so they stay sharp. */
    private const W = 1200;

    private const H = 1000;

    public const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

    /** Validation for the upload field. */
    public static function rule(bool $required): array
    {
        return [
            $required ? 'required' : 'nullable', 'file',
            'mimetypes:image/jpeg,image/png,image/webp,'.implode(',', self::VIDEO_TYPES),
            'max:'.((int) config('ads.video_max_mb') * 1024),
        ];
    }

    /**
     * Store the upload; videos longer than allowed are refused when ffmpeg can tell.
     *
     * @return array{image_path: ?string, video_path: ?string, poster_path: null}
     */
    public static function store(UploadedFile $file, Ffmpeg $ffmpeg, string $field = 'media'): array
    {
        if (! in_array($file->getMimeType(), self::VIDEO_TYPES, true)) {
            if ($file->getSize() > 5 * 1024 * 1024) {
                throw ValidationException::withMessages([$field => __('Pictures can be at most 5 MB.')]);
            }

            return ['image_path' => Images::storeCropped($file, 'ads', self::W, self::H), 'video_path' => null, 'poster_path' => null];
        }
        $max = (int) config('ads.video_max_seconds');
        if ($ffmpeg->available()) {
            try {
                $seconds = $ffmpeg->probe($file->getRealPath())['duration'];
            } catch (\Throwable) {
                throw ValidationException::withMessages([$field => __('This video can’t be played. Try an MP4 file.')]);
            }
            if ($seconds > $max + 0.5) {
                throw ValidationException::withMessages([$field => __('Videos can be at most :seconds seconds.', ['seconds' => $max])]);
            }
        }
        $ext = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'mp4');
        $ext = $ext === 'qt' ? 'mov' : $ext;

        return ['image_path' => null, 'video_path' => $file->storeAs('ads/videos', Str::lower((string) Str::ulid()).'.'.$ext, 'public'), 'poster_path' => null];
    }

    /** After saving a banner with a new video: make its web version and still in the background. */
    public static function process(Ad $ad): void
    {
        if ($ad->video_path) {
            ProcessAdVideo::dispatch($ad->id);
        }
    }
}
