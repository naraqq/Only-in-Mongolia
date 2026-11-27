<?php

namespace App\Media;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

/**
 * What creators and fans may upload (posts, messages, the library): photos, videos, and audio (music, podcasts,
 * voice). One list, so every upload form accepts the same files.
 */
class Uploads
{
    public const IMAGE = ['image/jpeg', 'image/png', 'image/webp'];

    public const VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];

    /** Browsers and servers name the same formats differently, so all the usual spellings. */
    public const AUDIO = [
        'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac',
        'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/ogg', 'audio/opus', 'audio/webm', 'audio/flac', 'audio/x-flac',
    ];

    /** Audio files that some servers detect as a video container (an .m4a is an MP4 with sound only). */
    private const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'];

    /** Largest file per kind, in KB: photos 20 MB, videos 40 MB, audio 100 MB (about an hour of podcast). */
    public const MAX_KB = ['image' => 20 * 1024, 'video' => 40 * 1024, 'audio' => 100 * 1024];

    /** Validation rule for one uploaded file (the size per kind is checked by checkSizes()). */
    public static function rule(): array
    {
        return ['file', 'mimetypes:'.implode(',', [...self::IMAGE, ...self::VIDEO, ...self::AUDIO]), 'max:'.max(self::MAX_KB)];
    }

    /** image | video | audio */
    public static function type(UploadedFile $file): string
    {
        $mime = (string) $file->getMimeType();
        if (str_starts_with($mime, 'audio/') || in_array(strtolower($file->getClientOriginalExtension()), self::AUDIO_EXTENSIONS, true)) {
            return 'audio';
        }

        return str_starts_with($mime, 'video/') ? 'video' : 'image';
    }

    /** The type to store and send to browsers (an .m4a detected as video/mp4 is sent as audio/mp4). */
    public static function mime(UploadedFile $file): string
    {
        $mime = (string) $file->getMimeType();

        return self::type($file) === 'audio' && ! str_starts_with($mime, 'audio/') ? 'audio/mp4' : $mime;
    }

    /** @return array{type: string, mime: string} */
    public static function describe(UploadedFile $file): array
    {
        return ['type' => self::type($file), 'mime' => self::mime($file)];
    }

    /**
     * Stop the request if a file is larger than its kind allows.
     *
     * @param  array<int, UploadedFile>  $files
     */
    public static function checkSizes(array $files, string $field = 'media'): void
    {
        foreach ($files as $i => $file) {
            $type = self::type($file);
            if ($file->getSize() > self::MAX_KB[$type] * 1024) {
                throw ValidationException::withMessages(["{$field}.{$i}" => match ($type) {
                    'image' => __('Photos can be at most 20 MB.'),
                    'video' => __('Videos can be at most 40 MB.'),
                    default => __('Audio files can be at most 100 MB.'),
                }]);
            }
        }
    }
}
