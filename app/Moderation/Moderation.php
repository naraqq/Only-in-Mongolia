<?php

namespace App\Moderation;

use App\Jobs\ScanMedia;
use App\Models\MessageMedia;
use App\Models\PostMedia;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Upload safety: refuse files on the blocklist, fingerprint what's kept, queue each file for the automatic scan,
 * and put removed files on the blocklist so they can't come back.
 */
class Moderation
{
    public static function fingerprint(UploadedFile|string $file): string
    {
        return hash_file('sha256', $file instanceof UploadedFile ? $file->getRealPath() : Storage::path($file));
    }

    /**
     * Stop the request if any uploaded file is on the blocklist. Says nothing about why, on purpose.
     *
     * @param  array<int, UploadedFile>  $files
     * @return array<int, string> the fingerprints, by the same keys
     */
    public static function screen(array $files, string $field = 'media'): array
    {
        $hashes = array_map(fn (UploadedFile $f) => self::fingerprint($f), $files);
        $blocked = DB::table('media_blocklist')->whereIn('sha256', array_values($hashes))->pluck('sha256')->all();
        foreach ($hashes as $i => $h) {
            if (in_array($h, $blocked, true)) {
                throw ValidationException::withMessages(["{$field}.{$i}" => __('This file can’t be uploaded.')]);
            }
        }

        return $hashes;
    }

    /** Queue the automatic scan for media that were just saved (runs after the database commit). */
    public static function queue(PostMedia|MessageMedia ...$media): void
    {
        foreach ($media as $m) {
            ScanMedia::dispatch($m::class, $m->id)->afterCommit();
        }
    }

    /** Never allow these files again. */
    public static function block(iterable $media, string $reason, ?string $source = null, ?int $by = null): void
    {
        $rows = collect($media)->map(fn ($m) => $m->sha256 ?? (Storage::exists($m->path) ? self::fingerprint($m->path) : null))
            ->filter()->unique()
            ->map(fn ($h) => ['sha256' => $h, 'reason' => $reason, 'source' => $source, 'added_by' => $by, 'created_at' => now(), 'updated_at' => now()])
            ->values()->all();
        DB::table('media_blocklist')->insertOrIgnore($rows);
    }
}
