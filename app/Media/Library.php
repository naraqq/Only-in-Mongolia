<?php

namespace App\Media;

use App\Models\CreatorProfile;
use App\Models\MessageMedia;
use App\Models\Payment;
use App\Models\Post;
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
            if (! $item || ! Files::exists($item->path) || in_array($item->sha256, $blocked, true) || self::flagged($item->path)) {
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
                Previews::delete($path);
                Files::delete($path);
                Storage::disk('local')->deleteDirectory(Stamp::folder($path)); // stamped copies live on this server
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

    /**
     * How each file did: views of the posts it's in, and what those posts and paid messages earned (after the fee).
     *
     * @return array<string, array{views: int, earned: int}>
     */
    public static function stats(CreatorProfile $creator, array $paths): array
    {
        if (! $paths) {
            return [];
        }
        $posts = PostMedia::whereIn('post_media.path', $paths)->join('posts', 'posts.id', '=', 'post_media.post_id')
            ->where('posts.creator_profile_id', $creator->id)->get(['post_media.path', 'posts.id as post_id']);
        $messages = MessageMedia::whereIn('path', $paths)->get(['path', 'message_id']);
        $postIds = $posts->pluck('post_id')->unique()->all();
        $views = $postIds ? DB::table('post_views')->whereIn('post_id', $postIds)->selectRaw('post_id, count(*) as n')->groupBy('post_id')->pluck('n', 'post_id') : collect();
        $paid = fn () => DB::table('payments')->where('creator_profile_id', $creator->id)->where('status', Payment::PAID);
        $postEarned = $postIds ? $paid()->whereIn('post_id', $postIds)->selectRaw('post_id, sum(amount - platform_fee) as n')->groupBy('post_id')->pluck('n', 'post_id') : collect();
        $messageIds = $messages->pluck('message_id')->unique()->all();
        $messageEarned = $messageIds ? $paid()->whereIn('message_id', $messageIds)->selectRaw('message_id, sum(amount - platform_fee) as n')->groupBy('message_id')->pluck('n', 'message_id') : collect();

        $out = [];
        foreach ($paths as $path) {
            $ids = $posts->where('path', $path)->pluck('post_id')->unique();
            $out[$path] = [
                'views' => (int) $ids->sum(fn ($id) => $views[$id] ?? 0),
                'earned' => (int) $ids->sum(fn ($id) => $postEarned[$id] ?? 0)
                    + (int) $messages->where('path', $path)->pluck('message_id')->unique()->sum(fn ($id) => $messageEarned[$id] ?? 0),
            ];
        }

        return $out;
    }

    /** The posts a file is in (newest first, with how each did) and how many messages carry it. */
    public static function usage(CreatorProfile $creator, string $path): array
    {
        $posts = Post::where('creator_profile_id', $creator->id)->whereHas('media', fn ($m) => $m->where('path', $path))
            ->withCount('likes')->latest()->take(50)->get();
        $views = DB::table('post_views')->whereIn('post_id', $posts->pluck('id'))->selectRaw('post_id, count(*) as n')->groupBy('post_id')->pluck('n', 'post_id');
        $earned = DB::table('payments')->where('status', Payment::PAID)->whereIn('post_id', $posts->pluck('id'))
            ->selectRaw('post_id, sum(amount - platform_fee) as n')->groupBy('post_id')->pluck('n', 'post_id');
        $messages = MessageMedia::where('message_media.path', $path)->join('messages', 'messages.id', '=', 'message_media.message_id');

        return [
            'posts' => $posts->map(fn (Post $p) => [
                'id' => $p->id,
                'body' => $p->body ? mb_strimwidth($p->body, 0, 80, '…') : null,
                'created_at' => $p->created_at->toIso8601String(),
                'visibility' => $p->visibility,
                'price' => $p->price,
                'scheduled' => $p->isScheduled(),
                'views' => (int) ($views[$p->id] ?? 0),
                'likes' => (int) $p->likes_count,
                'earned' => (int) ($earned[$p->id] ?? 0),
            ])->all(),
            'messages' => (int) (clone $messages)->where('messages.is_mass', false)->count(),
            'mass' => (int) (clone $messages)->where('messages.is_mass', true)->count(),
        ];
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
