<?php

namespace App\Media;

use App\Models\MediaUpload;
use App\Models\User;
use App\Moderation\Moderation;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Big files (long videos, podcasts) sent in small pieces instead of one huge form post, so no request ever
 * comes near PHP's size limit, a dropped connection only costs one piece, and an upload can be paused and resumed.
 *
 * 1. start(): the browser says what's coming (name, size, type); we check the kind and size up front.
 * 2. putChunk(): pieces arrive (several at once, in any order), each saved on this server's own disk.
 * 3. complete(): the pieces are joined, the real file type is checked, the blocklist screened, and the file
 *    moved to the media disk (local or R2). Only then can a post use it, by the upload's id.
 *
 * Pieces and finished files nobody used are removed by prune() (the media:prune-uploads command).
 */
class ChunkedUploads
{
    private const DIR = 'chunked';

    /** Pieces of 8 MB: small enough for any server limit, big enough not to waste time on requests. */
    private const CHUNK_BYTES = 8 * 1024 * 1024;

    /** Unfinished uploads one person can have open at a time. */
    public const MAX_OPEN = 30;

    /** A piece's size: 8 MB, or less when this server's PHP accepts less per request. */
    public static function chunkSize(): int
    {
        $limit = self::iniBytes((string) ini_get('post_max_size'));

        return $limit > 0 ? max(256 * 1024, min(self::CHUNK_BYTES, $limit - 64 * 1024)) : self::CHUNK_BYTES;
    }

    public static function start(User $user, string $name, int $size, ?string $mime): MediaUpload
    {
        $kind = Uploads::kindFor($mime, $name);
        if ($kind === null) {
            throw ValidationException::withMessages(['file' => __('Only photos (JPG, PNG, WebP), videos (MP4, MOV, WebM) and audio can be uploaded.')]);
        }
        if ($size > Uploads::CHUNKED_MAX_KB[$kind] * 1024) {
            throw ValidationException::withMessages(['file' => Uploads::tooLargeMessage($kind, true)]);
        }
        if (MediaUpload::where('user_id', $user->id)->whereNull('completed_at')->count() >= self::MAX_OPEN) {
            throw ValidationException::withMessages(['file' => __('Too many uploads at once. Finish or remove some first.')]);
        }
        $chunk = self::chunkSize();

        return MediaUpload::create([
            'user_id' => $user->id,
            'name' => mb_substr($name, 0, 255),
            'size' => $size,
            'chunk_size' => $chunk,
            'chunks' => max(1, (int) ceil($size / $chunk)),
        ]);
    }

    /** The pieces already here, so an interrupted upload sends only the rest. @return list<int> */
    public static function received(MediaUpload $upload): array
    {
        if ($upload->completed_at) {
            return range(0, $upload->chunks - 1);
        }
        $have = [];
        foreach (Storage::disk('local')->files(self::dir($upload)) as $file) {
            if (preg_match('/(\d+)\.part$/', $file, $m)) {
                $have[] = (int) $m[1];
            }
        }
        sort($have);

        return $have;
    }

    /** How many bytes piece $index must have (the last one is usually shorter). */
    public static function expectedBytes(MediaUpload $upload, int $index): int
    {
        return $index === $upload->chunks - 1 ? $upload->size - $index * $upload->chunk_size : $upload->chunk_size;
    }

    /**
     * Save one piece. Sending the same piece twice is fine (the later copy wins), so the browser can simply retry.
     *
     * @param  resource|string  $body
     */
    public static function putChunk(MediaUpload $upload, int $index, mixed $body): void
    {
        if ($upload->completed_at) {
            return; // already finished: a late retry of a piece that made it
        }
        if ($index < 0 || $index >= $upload->chunks) {
            throw ValidationException::withMessages(['chunk' => 'No such piece.']);
        }
        $disk = Storage::disk('local');
        $disk->makeDirectory(self::dir($upload));
        $final = $disk->path(self::dir($upload)."/{$index}.part");
        $tmp = $final.'.'.bin2hex(random_bytes(4)).'.tmp';

        $out = fopen($tmp, 'wb');
        $written = is_resource($body) ? stream_copy_to_stream($body, $out) : fwrite($out, (string) $body);
        fclose($out);

        if ($written !== self::expectedBytes($upload, $index)) {
            @unlink($tmp);
            throw ValidationException::withMessages(['chunk' => 'The piece arrived incomplete. Send it again.']);
        }
        rename($tmp, $final); // atomic: complete() never joins half a piece
        $upload->touch();
    }

    /** @return list<int> the pieces still missing */
    public static function missing(MediaUpload $upload): array
    {
        return array_values(array_diff(range(0, $upload->chunks - 1), self::received($upload)));
    }

    /**
     * Join the pieces, check the result, and put it on the media disk. Safe to call again (returns the same upload).
     * A file that fails a check is thrown away along with its pieces.
     */
    public static function complete(MediaUpload $upload): MediaUpload
    {
        if ($upload->completed_at) {
            return $upload;
        }
        @set_time_limit(0); // a 2 GB video takes a while to join and copy to R2

        $disk = Storage::disk('local');
        $dir = self::dir($upload);
        $joined = $disk->path($dir.'/joined.'.bin2hex(random_bytes(4)));
        $out = fopen($joined, 'wb');
        for ($i = 0; $i < $upload->chunks; $i++) {
            $in = fopen($disk->path("{$dir}/{$i}.part"), 'rb');
            stream_copy_to_stream($in, $out);
            fclose($in);
        }
        fclose($out);

        try {
            clearstatcache(true, $joined);
            if (filesize($joined) !== $upload->size) {
                throw ValidationException::withMessages(['file' => __('The upload didn’t arrive complete. Please try again.')]);
            }
            $file = new UploadedFile($joined, $upload->name, null, null, true);
            if (! Uploads::allowed($file)) {
                throw ValidationException::withMessages(['file' => __('Only photos (JPG, PNG, WebP), videos (MP4, MOV, WebM) and audio can be uploaded.')]);
            }
            $type = Uploads::type($file);
            if ($upload->size > Uploads::CHUNKED_MAX_KB[$type] * 1024) {
                throw ValidationException::withMessages(['file' => Uploads::tooLargeMessage($type, true)]);
            }
            $hash = Moderation::screen([$file], 'file')[0];
            $described = Uploads::describe($file);
            $path = Files::store($file, "uploads/{$upload->user_id}"); // the media disk (private)
        } catch (\Throwable $e) {
            self::discard($upload);
            throw $e;
        }

        $disk->deleteDirectory($dir);
        $upload->update([...$described, 'path' => $path, 'sha256' => $hash, 'completed_at' => now()]);

        return $upload;
    }

    /** Remove an upload nobody will use (cancelled, failed, or forgotten). Files already in a post stay. */
    public static function discard(MediaUpload $upload): void
    {
        Storage::disk('local')->deleteDirectory(self::dir($upload));
        if ($upload->attached_at) {
            return;
        }
        if ($upload->path) {
            Files::delete($upload->path);
        }
        $upload->delete();
    }

    /**
     * Finished uploads of $user, in the order given, ready to go into a post. Fails if any is unknown, unfinished,
     * already used, or (since it finished) put on the blocklist.
     *
     * @param  array<int, string>  $ids
     * @return list<MediaUpload>
     */
    public static function attachable(User $user, array $ids, string $field = 'uploads'): array
    {
        $ids = array_values(array_unique(array_map('strval', $ids)));
        if (! $ids) {
            return [];
        }
        $found = MediaUpload::where('user_id', $user->id)->whereIn('id', $ids)
            ->whereNotNull('completed_at')->whereNull('attached_at')->get()->keyBy('id');
        if ($found->count() !== count($ids)) {
            throw ValidationException::withMessages([$field => __('A file is still uploading or has expired. Remove it and add it again.')]);
        }
        if (DB::table('media_blocklist')->whereIn('sha256', $found->pluck('sha256')->filter())->exists()) {
            throw ValidationException::withMessages([$field => __('This file can’t be uploaded.')]);
        }

        return array_map(fn ($id) => $found[$id], $ids);
    }

    /** Mark an upload as used. False if another request used it first (call inside the transaction that uses it). */
    public static function markAttached(MediaUpload $upload): bool
    {
        return MediaUpload::whereKey($upload->getKey())->whereNull('attached_at')->update(['attached_at' => now()]) === 1;
    }

    /** Remove pieces and finished files nobody used within $hours hours. Returns how many uploads went. */
    public static function prune(int $hours): int
    {
        $gone = 0;
        MediaUpload::whereNull('attached_at')->where('updated_at', '<', now()->subHours($hours))
            ->chunkById(100, function ($uploads) use (&$gone) {
                foreach ($uploads as $upload) {
                    self::discard($upload);
                    $gone++;
                }
            });
        // Used ones only need their row for a short while (nothing reads it afterwards).
        MediaUpload::whereNotNull('attached_at')->where('attached_at', '<', now()->subDays(7))->delete();

        return $gone;
    }

    private static function dir(MediaUpload $upload): string
    {
        return self::DIR.'/'.$upload->getKey();
    }

    private static function iniBytes(string $value): int
    {
        $value = trim($value);
        if ($value === '' || $value === '0' || $value === '-1') {
            return 0;
        }
        $n = (int) $value;

        return match (strtolower(substr($value, -1))) {
            'g' => $n * 1024 ** 3,
            'm' => $n * 1024 ** 2,
            'k' => $n * 1024,
            default => $n,
        };
    }
}
