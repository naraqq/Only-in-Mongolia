<?php

namespace App\Media;

use App\Models\CreatorProfile;
use App\Models\MessageMedia;
use App\Models\PostMedia;
use App\Models\VaultItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * A creator's media library. Every upload is kept here, and posts and messages can reuse it without uploading again.
 * Several posts, messages and the library can point at one stored file, so files are only deleted when unused.
 */
class Library
{
    /** Most photos/videos one post or message can hold, uploads and library picks together. */
    public const MAX_PER_ITEM = 10;

    /** Keep a newly stored upload in the creator's library. */
    public static function record(CreatorProfile $creator, array $file): void
    {
        VaultItem::firstOrCreate(
            ['creator_profile_id' => $creator->id, 'path' => $file['path']],
            ['type' => $file['type'], 'mime' => $file['mime'], 'sha256' => $file['sha256'] ?? null],
        );
    }

    /**
     * The library picks to attach, as file rows (type, path, mime, sha256, and the scan result to carry over).
     * Only the creator's own items, never anything blocked or held by the scan.
     *
     * @param  array<int, int|string>  $ids
     * @return list<array<string, mixed>>
     */
    public static function pick(CreatorProfile $creator, array $ids, string $field = 'vault'): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (! $ids) {
            return [];
        }
        $items = VaultItem::where('creator_profile_id', $creator->id)->whereIn('id', $ids)->get()->keyBy('id');
        $blocked = DB::table('media_blocklist')->whereIn('sha256', $items->pluck('sha256')->filter())->pluck('sha256')->all();

        $files = [];
        foreach ($ids as $i => $id) {
            $item = $items[$id] ?? null;
            if (! $item || ! Storage::exists($item->path) || in_array($item->sha256, $blocked, true) || self::flagged($item->path)) {
                throw ValidationException::withMessages(["{$field}.{$i}" => __('This file can’t be used.')]);
            }
            $files[] = [
                'type' => $item->type, 'path' => $item->path, 'mime' => $item->mime, 'sha256' => $item->sha256,
                // Already scanned as another post or message: reuse the result instead of scanning again.
                'scan_status' => self::scanned($item->path),
            ];
        }

        return $files;
    }

    /** Delete stored files (and their stamped copies) that no post, message or library item uses any more. */
    public static function deleteUnused(iterable $paths): void
    {
        foreach (collect($paths)->unique() as $path) {
            $used = PostMedia::where('path', $path)->exists() || MessageMedia::where('path', $path)->exists()
                || VaultItem::where('path', $path)->exists();
            if (! $used) {
                Storage::delete($path);
                Storage::deleteDirectory(Stamp::folder($path));
            }
        }
    }

    /** How many posts and messages use each path (one mass message counts once). */
    public static function uses(array $paths): array
    {
        $posts = PostMedia::whereIn('path', $paths)->selectRaw('path, count(*) as n')->groupBy('path')->pluck('n', 'path');
        $messages = MessageMedia::whereIn('path', $paths)->join('messages', 'messages.id', '=', 'message_media.message_id')
            ->selectRaw('path, count(distinct case when messages.is_mass then -1 else messages.id end) as n')->groupBy('path')->pluck('n', 'path');

        return collect($paths)->mapWithKeys(fn ($p) => [$p => (int) ($posts[$p] ?? 0) + (int) ($messages[$p] ?? 0)])->all();
    }

    private static function flagged(string $path): bool
    {
        return PostMedia::where('path', $path)->where('scan_status', 'flagged')->exists()
            || MessageMedia::where('path', $path)->where('scan_status', 'flagged')->exists();
    }

    /**
     * 'ok' if the file already passed the scan in a non-18+ setting (the strictest), so it's fine anywhere.
     * A file that only passed as 18+ is scanned again for a regular post.
     */
    private static function scanned(string $path): ?string
    {
        $ok = PostMedia::where('path', $path)->where('scan_status', 'ok')->whereHas('post', fn ($q) => $q->where('is_adult', false))->exists()
            || MessageMedia::where('path', $path)->where('scan_status', 'ok')->exists();

        return $ok ? 'ok' : null;
    }
}
