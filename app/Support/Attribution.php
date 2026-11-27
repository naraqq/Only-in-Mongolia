<?php

namespace App\Support;

use App\Models\CreatorProfile;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Where follows and subscriptions come from, for the creator's conversion insights.
 *
 * - source: the place the Follow / Subscribe button was clicked (profile, a series, a locked post, the feed, discover…),
 *   with source_id for a series or post.
 * - referrer: how the fan found the creator in this browser session: an outside site ("instagram.com"),
 *   a tag on a shared link ("ref:story"), a place in the app ("app:discover"), or "direct".
 * - source_post_id (follows only): the last free post of the creator the fan saw in the week before following.
 */
class Attribution
{
    /** Places in the app a button can be clicked from. */
    public const PLACES = ['profile', 'series', 'post', 'home', 'feed', 'discover', 'search', 'messages', 'saved', 'notifications', 'creator', 'other'];

    private const SESSION = 'attribution';

    /** How long a seen free post still counts toward a follow. */
    private const POST_WINDOW_DAYS = 7;

    /** A creator page was shown (reported by the browser, so hover-prefetches don't count). */
    public static function visit(Request $request, CreatorProfile $creator, string $page, int $pageId, ?string $from, ?string $ref): void
    {
        $me = $request->user();
        if ($me?->id === $creator->user_id) {
            return;
        }

        $here = self::place($from, $request, $creator);
        $found = self::tag($ref) ?? match (true) {
            $from === null || $from === '' => 'direct',
            $here === null => self::host($from) ?? 'direct',
            default => 'app:'.$here[0],
        };
        // Moving between this creator's own pages keeps how they found the creator; a new outside link or tag replaces it.
        $key = self::SESSION.'.ref.'.$creator->id;
        $known = $request->session()->get($key);
        $sameCreator = $here !== null && in_array($here[0], ['profile', 'series', 'post'], true);
        if (! $known || (! $sameCreator && ! str_starts_with($found, 'app:') && $found !== 'direct')) {
            $request->session()->put($key, $found);
            $known = $found;
        }

        DB::table('page_visits')->insertOrIgnore([
            'creator_profile_id' => $creator->id,
            'page' => $page,
            'page_id' => $pageId,
            'viewer' => self::viewer($request),
            'referrer' => $sameCreator ? $known : $found,
            'day' => now()->toDateString(),
        ]);
    }

    /** Checkout opened: remember where the Subscribe button was (the page before, or the locked post it was on). */
    public static function startCheckout(Request $request, CreatorProfile $creator): void
    {
        $postId = $request->integer('post');
        $source = $postId && $creator->posts()->whereKey($postId)->exists()
            ? ['post', $postId]
            : self::place($request->headers->get('referer'), $request, $creator);
        if ($source === null || $source[0] === 'checkout') {
            return; // reloaded the checkout, or came from outside: keep what we knew
        }
        $request->session()->put(self::SESSION.'.checkout.'.$creator->id, $source);
    }

    /** @return array{source: ?string, source_id: ?int, referrer: ?string} */
    public static function forSubscription(Request $request, CreatorProfile $creator): array
    {
        [$source, $id] = $request->session()->get(self::SESSION.'.checkout.'.$creator->id) ?? ['other', null];

        return ['source' => $source, 'source_id' => $id, 'referrer' => self::referrer($request, $creator)];
    }

    /** @return array{source: string, source_id: ?int, source_post_id: ?int, referrer: string} */
    public static function forFollow(Request $request, User $fan, CreatorProfile $creator): array
    {
        $place = self::place($request->headers->get('referer'), $request, $creator);
        if ($place !== null && $place[0] === 'checkout') {
            $place = null;
        }
        $seen = DB::table('post_views')->join('posts', 'posts.id', '=', 'post_views.post_id')
            ->where('posts.creator_profile_id', $creator->id)->whereNull('posts.price')->where('posts.visibility', 'public')
            ->where('post_views.viewer', (string) $fan->id)
            ->where('post_views.day', '>=', now()->subDays(self::POST_WINDOW_DAYS)->toDateString())
            ->orderByDesc('post_views.day')->orderByDesc('post_views.id')->value('posts.id');

        return [
            'source' => $place[0] ?? 'other',
            'source_id' => $place[1] ?? null,
            'source_post_id' => $seen,
            'referrer' => self::referrer($request, $creator),
        ];
    }

    private static function referrer(Request $request, CreatorProfile $creator): string
    {
        return $request->session()->get(self::SESSION.'.ref.'.$creator->id) ?? 'direct';
    }

    /** The visitor, as post views count them. */
    public static function viewer(Request $request): string
    {
        $me = $request->user();

        return $me ? (string) $me->id : 's:'.substr(hash('sha256', $request->session()->getId()), 0, 40);
    }

    /**
     * Which place in the app a URL is, relative to this creator: [place, id]. Null for outside URLs.
     *
     * @return array{0: string, 1: ?int}|null
     */
    public static function place(?string $url, Request $request, CreatorProfile $creator): ?array
    {
        if (! $url || ! ($parts = parse_url($url)) || (isset($parts['host']) && strcasecmp($parts['host'], $request->getHost()) !== 0)) {
            return null;
        }
        $path = '/'.trim(rawurldecode($parts['path'] ?? '/'), '/');
        $handle = preg_quote($creator->handle, '#');

        return match (true) {
            $path === '/' => ['home', null],
            (bool) preg_match('#^/@'.$handle.'/subscribe$#i', $path) => ['checkout', null],
            (bool) preg_match('#^/@'.$handle.'/series/(\d+)$#i', $path, $m) => ['series', (int) $m[1]],
            (bool) preg_match('#^/@'.$handle.'$#i', $path) => self::focused($parts['query'] ?? ''),
            str_starts_with($path, '/@') => ['creator', null],
            $path === '/feed' => ['feed', null],
            $path === '/creators' => ['discover', null],
            $path === '/search' => ['search', null],
            str_starts_with($path, '/messages'), str_starts_with($path, '/studio/messages') => ['messages', null],
            $path === '/saved' => ['saved', null],
            $path === '/notifications' => ['notifications', null],
            default => ['other', null],
        };
    }

    /** A creator page opened on one post (?focus=…) counts as that post. */
    private static function focused(string $query): array
    {
        parse_str($query, $q);
        $id = (int) ($q['focus'] ?? 0);

        return $id > 0 ? ['post', $id] : ['profile', null];
    }

    /** "l.instagram.com" → "instagram.com": the site, without app-specific subdomains. */
    private static function host(string $url): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($host === '' || ! preg_match('/^[a-z0-9.-]+$/', $host)) {
            return null;
        }
        $labels = explode('.', $host);

        return mb_substr(count($labels) > 2 ? implode('.', array_slice($labels, -2)) : $host, 0, 64);
    }

    /** A tag on a shared link: /@handle?ref=story → "ref:story". */
    private static function tag(?string $ref): ?string
    {
        $ref = strtolower(trim((string) $ref));

        return preg_match('/^[a-z0-9_-]{1,32}$/', $ref) ? 'ref:'.$ref : null;
    }
}
