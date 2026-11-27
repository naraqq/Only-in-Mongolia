<?php

namespace App\Media;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Where creators' photos, videos and ID documents live: the "media disk" (config filesystems.media_disk).
 * Locally that's the private disk on this server; in production it can be Cloudflare R2 (an S3-compatible bucket,
 * kept private), so viewers download straight from Cloudflare and this server pays no transfer for it.
 *
 * Every view still goes through the app's permission check first; on R2 the answer is a redirect to a signed link
 * that works for a few minutes only. Work that needs the actual bytes (stamping a photo with the viewer's ID,
 * scanning, fingerprints) uses a local copy, downloaded once and kept in a cache (downloads from R2 are free).
 * Stamped copies and that cache always stay on this server's own disk.
 */
class Files
{
    /** How long a signed R2 link works. Short, since anyone holding the link can use it until then. */
    public const LINK_MINUTES = 10;

    private const CACHE = 'media-cache';

    public static function diskName(): string
    {
        return (string) config('filesystems.media_disk', 'local');
    }

    public static function disk(): Filesystem
    {
        return Storage::disk(self::diskName());
    }

    /** True when media live in a bucket (R2/S3) rather than on this server. */
    public static function remote(): bool
    {
        return config('filesystems.disks.'.self::diskName().'.driver') === 's3';
    }

    /** Save an upload under $dir with a random name; returns its path. */
    public static function store(UploadedFile $file, string $dir): string
    {
        return $file->store($dir, ['disk' => self::diskName()]);
    }

    public static function put(string $path, string $contents): void
    {
        self::disk()->put($path, $contents);
    }

    public static function exists(string $path): bool
    {
        return self::disk()->exists($path);
    }

    /** @param string|array<int, string> $paths */
    public static function delete(string|array $paths): void
    {
        $paths = array_values(array_filter((array) $paths));
        if ($paths) {
            self::disk()->delete($paths);
            Storage::disk('local')->delete(array_map(fn ($p) => self::CACHE.'/'.$p, $paths));
        }
    }

    /** A path on this server's disk for a stored file (a cached download when media are on R2). */
    public static function localPath(string $path): string
    {
        if (! self::remote()) {
            return self::disk()->path($path);
        }
        $local = Storage::disk('local');
        $cached = self::CACHE.'/'.$path;
        if (! $local->exists($cached)) {
            $local->makeDirectory(dirname($cached));
            $tmp = $local->path($cached).'.'.bin2hex(random_bytes(4)).'.tmp';
            $in = self::disk()->readStream($path);
            $out = fopen($tmp, 'wb');
            stream_copy_to_stream($in, $out);
            fclose($out);
            is_resource($in) && fclose($in);
            rename($tmp, $local->path($cached)); // atomic: a second request never reads half a file
        } else {
            touch($local->path($cached)); // still in use; keep it past the next prune
        }

        return $local->path($cached);
    }

    /**
     * Send a stored file to someone already allowed to see it: from this server, or (on R2) a redirect to a
     * short-lived signed link, so the bytes come from Cloudflare. Videos can be scrubbed either way (range requests).
     */
    public static function response(string $path, string $mime, array $headers = []): BinaryFileResponse|RedirectResponse
    {
        if (self::remote()) {
            $url = self::disk()->temporaryUrl($path, now()->addMinutes(self::LINK_MINUTES), [
                'ResponseContentType' => $mime,
                'ResponseContentDisposition' => 'inline',
                'ResponseCacheControl' => 'private, max-age=3600',
            ]);

            // The browser may reuse this redirect for a few minutes (well within the link's lifetime).
            return redirect()->away($url)->withHeaders([
                'Cache-Control' => 'private, max-age='.(self::LINK_MINUTES * 60 / 2),
                'Referrer-Policy' => 'no-referrer',
            ]);
        }

        return response()->file(self::disk()->path($path), ['Content-Type' => $mime, 'X-Content-Type-Options' => 'nosniff', ...$headers]);
    }

    /** Forget cached downloads nobody has used for $days days. Returns how many went. */
    public static function pruneCache(int $days): int
    {
        $disk = Storage::disk('local');
        $cutoff = now()->subDays($days)->getTimestamp();
        $gone = 0;
        foreach ($disk->allFiles(self::CACHE) as $file) {
            if ($disk->lastModified($file) < $cutoff) {
                $disk->delete($file);
                $gone++;
            }
        }

        return $gone;
    }
}
