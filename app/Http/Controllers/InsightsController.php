<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/** Creator insights: views, growth and earnings over time, and how each post did. Plus recording views. */
class InsightsController extends Controller
{
    public const RANGES = [7, 30, 90];

    /** The browser reports posts that were really seen (batched). Unique per viewer per post per day. */
    public function views(Request $request): JsonResponse
    {
        $ids = collect($request->validate(['ids' => ['required', 'array', 'max:50'], 'ids.*' => ['integer']])['ids'])->unique();
        $me = $request->user();
        $viewer = $me ? (string) $me->id : 's:'.substr(hash('sha256', $request->session()->getId()), 0, 40);

        // Only posts that exist, aren't the viewer's own, and that they can see.
        $posts = Post::with('creator')->whereIn('id', $ids)->get()
            ->filter(fn (Post $p) => $p->creator->user_id !== $me?->id && $p->isVisibleTo($me));
        $day = now()->toDateString();
        DB::table('post_views')->insertOrIgnore($posts->map(fn ($p) => ['post_id' => $p->id, 'viewer' => $viewer, 'day' => $day])->values()->all());

        return response()->json(['ok' => true]);
    }

    public function index(Request $request): Response
    {
        $creator = $request->user()->creatorProfile()->where('status', CreatorProfile::APPROVED)->firstOrFail();
        $days = in_array((int) $request->query('days'), self::RANGES, true) ? (int) $request->query('days') : 30;
        $since = now()->subDays($days - 1)->startOfDay();
        $postIds = $creator->posts()->pluck('id');
        $paid = fn () => $creator->payments()->where('status', Payment::PAID)->where('paid_at', '>=', $since);

        $views = $this->daily(DB::table('post_views')->whereIn('post_id', $postIds)->where('day', '>=', $since->toDateString())
            ->selectRaw('day as d, count(*) as v')->groupBy('day')->pluck('v', 'd'), $since, $days);
        $earnings = $this->daily($paid()->selectRaw('date(paid_at) as d, sum(amount - platform_fee) as v')->groupBy('d')->pluck('v', 'd'), $since, $days);
        $subs = $this->daily($paid()->where('purpose', Payment::SUBSCRIPTION)->selectRaw('date(paid_at) as d, count(*) as v')->groupBy('d')->pluck('v', 'd'), $since, $days);
        $followers = $this->daily(DB::table('follows')->where('creator_profile_id', $creator->id)->where('created_at', '>=', $since)
            ->selectRaw('date(created_at) as d, count(*) as v')->groupBy('d')->pluck('v', 'd'), $since, $days);

        // Per post: views, likes, comments, and what it earned directly (unlocks and tips on it), in this period.
        $postViews = DB::table('post_views')->whereIn('post_id', $postIds)->where('day', '>=', $since->toDateString())
            ->selectRaw('post_id, count(*) as n')->groupBy('post_id')->pluck('n', 'post_id');
        $postEarned = $paid()->whereNotNull('post_id')->selectRaw('post_id, sum(amount - platform_fee) as n')->groupBy('post_id')->pluck('n', 'post_id');
        $posts = $creator->posts()->with('media')->withCount(['likes', 'comments'])->latest()->take(200)->get()
            ->map(fn (Post $p) => [
                'id' => $p->id,
                'body' => $p->body ? mb_strimwidth($p->body, 0, 90, '…') : null,
                'thumb' => (($m = $p->media->firstWhere('type', 'image')) ? route('media.show', $m) : null),
                'media' => $p->media->count(),
                'price' => $p->price,
                'visibility' => $p->visibility,
                'created_at' => $p->created_at->toIso8601String(),
                'views' => (int) ($postViews[$p->id] ?? 0),
                'likes' => (int) $p->likes_count,
                'comments' => (int) $p->comments_count,
                'earned' => (int) ($postEarned[$p->id] ?? 0),
            ])
            ->sortByDesc(fn ($p) => [$p['views'], $p['earned']])->values()->take(20);

        return Inertia::render('studio/insights', [
            'days' => $days,
            'ranges' => self::RANGES,
            'totals' => [
                'views' => array_sum(array_column($views, 'value')),
                'earnings' => array_sum(array_column($earnings, 'value')),
                'newSubscriptions' => array_sum(array_column($subs, 'value')),
                'newFollowers' => array_sum(array_column($followers, 'value')),
                'activeSubscribers' => $creator->subscriptions()->active()->count(),
                'trials' => DB::table('subscription_trials')->where('creator_profile_id', $creator->id)->where('created_at', '>=', $since)->count(),
            ],
            'series' => compact('views', 'earnings', 'subs', 'followers'),
            'bySource' => $paid()->groupBy('purpose')->selectRaw('purpose, sum(amount - platform_fee) as total, count(*) as n')->get()
                ->mapWithKeys(fn ($r) => [$r->purpose => ['total' => (int) $r->total, 'count' => (int) $r->n]]),
            'posts' => $posts,
        ]);
    }

    /** One value per day for the range, zero-filled. */
    private function daily($byDate, Carbon $since, int $days): array
    {
        return collect(range(0, $days - 1))->map(function ($i) use ($byDate, $since) {
            $d = $since->copy()->addDays($i)->toDateString();

            return ['date' => $d, 'value' => (int) ($byDate[$d] ?? 0)];
        })->all();
    }
}
