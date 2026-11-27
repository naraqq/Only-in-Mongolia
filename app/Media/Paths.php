<?php

namespace App\Media;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

/**
 * Where each stored file goes on the media disk (this server or the R2 bucket). One layout for everything:
 *
 *   users/{userId}/{purpose}/{yyyy}/{mm}/{ulid}.{ext}      photos, videos, audio (purpose: posts, messages, library)
 *   users/{userId}/{purpose}/{yyyy}/{mm}/{ulid}.web.mp4    a video converted for the web (replaces the upload)
 *   users/{userId}/{purpose}/{yyyy}/{mm}/{ulid}.poster.jpg  a video's still frame (App\Media\Previews)
 *   users/{userId}/{purpose}/{yyyy}/{mm}/{ulid}.thumbs.jpg  a video's seek-bar frames
 *   kyc/{userId}/{ulid}-{label}.{ext}                      ID documents (kept apart: stricter rules, admin-only)
 *
 * Everything a person uploaded is under one prefix, so it can be listed, measured or removed together (an account
 * deletion is one prefix), and the month keeps any single folder small. Names are ULIDs: unguessable, and they sort
 * by upload time. Files stored before this layout keep their old paths (the database holds each file's path).
 */
class Paths
{
    public const POSTS = 'posts';

    public const MESSAGES = 'messages';

    public const LIBRARY = 'library';

    private const PURPOSES = [self::POSTS, self::MESSAGES, self::LIBRARY];

    /** A new path for an upload by $userId, for $purpose (posts, messages, library). */
    public static function media(int $userId, string $purpose, UploadedFile|string $fileOrExt, ?\DateTimeInterface $at = null): string
    {
        abort_unless(in_array($purpose, self::PURPOSES, true), 500, "Unknown media purpose: {$purpose}");

        return sprintf('users/%d/%s/%s/%s.%s', $userId, $purpose, ($at ?? now())->format('Y/m'), Str::lower((string) Str::ulid()), self::ext($fileOrExt));
    }

    /** True for a path already in this layout. */
    public static function current(string $path): bool
    {
        return str_starts_with($path, 'users/') || str_starts_with($path, 'kyc/');
    }

    /** A new path for an ID document ($label: front, back, selfie). */
    public static function kyc(int $userId, string $label, UploadedFile|string $fileOrExt): string
    {
        $label = Str::slug($label) ?: 'doc';

        return sprintf('kyc/%d/%s-%s.%s', $userId, Str::lower((string) Str::ulid()), $label, self::ext($fileOrExt));
    }

    /** Where the web version of an uploaded video goes (App\Media\Transcoding): next to it, same name. */
    public static function web(string $videoPath): string
    {
        return self::isWeb($videoPath) ? $videoPath : self::sibling($videoPath, 'web.mp4');
    }

    /** True for a video this app already converted. */
    public static function isWeb(string $videoPath): bool
    {
        return str_ends_with($videoPath, '.web.mp4');
    }

    /** The folder of a video's adaptive-streaming playlists and pieces (App\Media\Hls): next to it, same name. */
    public static function hls(string $videoPath): string
    {
        return self::sibling($videoPath, 'hls');
    }

    /** Where a video's still frame goes: next to the video, same name. */
    public static function poster(string $videoPath): string
    {
        return self::sibling($videoPath, 'poster.jpg');
    }

    /** Where a video's seek-bar frames go: next to the video, same name. */
    public static function thumbs(string $videoPath): string
    {
        return self::sibling($videoPath, 'thumbs.jpg');
    }

    /** The file's extension from its contents (so a renamed file gets the right one), lower case. */
    public static function ext(UploadedFile|string $fileOrExt): string
    {
        if (is_string($fileOrExt)) {
            return Str::lower(ltrim($fileOrExt, '.')) ?: 'bin';
        }
        $client = Str::lower($fileOrExt->getClientOriginalExtension());
        // Audio in an MP4 box is detected as video/mp4; keep what the person called it (.m4a), when it's a known kind.
        if (Uploads::type($fileOrExt) === 'audio' && in_array($client, ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'], true)) {
            return $client;
        }
        $guessed = Str::lower((string) $fileOrExt->guessExtension());

        return match ($guessed) {
            'jpeg' => 'jpg',
            'qt' => 'mov',
            '' => $client ?: 'bin',
            default => $guessed,
        };
    }

    private static function sibling(string $path, string $suffix): string
    {
        $dot = strrpos($path, '.');
        $slash = strrpos($path, '/');
        $base = $dot !== false && ($slash === false || $dot > $slash) ? substr($path, 0, $dot) : $path;

        return "{$base}.{$suffix}";
    }
}
