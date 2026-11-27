<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Support\Attribution;
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

    /** The browser reports a creator page that was really shown (not a hover prefetch), with the page it came from. */
    public function visit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'handle' => ['required', 'string', 'max:30'],
            'page' => ['required', 'in:profile,series'],
            'page_id' => ['nullable', 'integer', 'min:0'],
            'from' => ['nullable', 'string', 'max:2048'],
            'ref' => ['nullable', 'string', 'max:64'],
        ]);
        $creator = CreatorProfile::where('handle', mb_strtolower($data['handle']))->where('status', CreatorProfile::APPROVED)->first();
        $pageId = $data['page'] === 'series' ? (int) ($data['page_id'] ?? 0) : 0;
        if ($creator && ($data['page'] === 'profile' || $creator->series()->whereKey($pageId)->exists())) {
            Attribution::visit($request, $creator, $data['page'], $pageId, $data['from'] ?? null, $data['ref'] ?? null);
        }

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
        // New subscribers only: renewals of access the fan already had aren't new subscriptions.
        $subs = $this->daily($paid()->where('purpose', Payment::SUBSCRIPTION)->where('renewal', false)->selectRaw('date(paid_at) as d, count(*) as v')->groupBy('d')->pluck('v', 'd'), $since, $days);
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
            'conversions' => $this->conversions($creator, $since),
            // Live Q&As in this period (and upcoming ones): the demand test before building video.
            'qas' => $creator->posts()->whereNotNull('qa_starts_at')->where('qa_starts_at', '>=', $since)
                ->withCount(['qaRsvps', 'qaQuestions', 'qaQuestions as answered_count' => fn ($q) => $q->whereNotNull('answered_at')])
                ->latest('qa_starts_at')->take(10)->get()
                ->tap(function ($qas) use (&$askers) {
                    $askers = DB::table('qa_questions')->whereIn('post_id', $qas->pluck('id'))
                        ->selectRaw('post_id, count(distinct user_id) as n')->groupBy('post_id')->pluck('n', 'post_id');
                })
                ->map(fn (Post $p) => [
                    'id' => $p->id,
                    'body' => $p->body ? mb_strimwidth($p->body, 0, 90, '…') : null,
                    'starts_at' => $p->qa_starts_at->toIso8601String(),
                    'state' => $p->qaState(),
                    'rsvps' => (int) $p->qa_rsvps_count,
                    'questions' => (int) $p->qa_questions_count,
                    'askers' => (int) ($askers[$p->id] ?? 0),
                    'answered' => (int) $p->answered_count,
                    'views' => (int) ($postViews[$p->id] ?? 0),
                ]),
            'shareLink' => route('creator.show', $creator->handle),
        ]);
    }

    /**
     * What turns visitors into fans, for this period:
     * - freePosts: free posts and the follows that came after seeing them (and how many of those later subscribed);
     * - places: where Follow / Subscribe was clicked (profile, a series, a locked post, the feed…), with visitors for pages;
     * - referrers: how people found the page (outside sites, ?ref= tags, places in the app).
     */
    private function conversions(CreatorProfile $creator, Carbon $since): array
    {
        $follows = fn () => DB::table('follows')->where('follows.creator_profile_id', $creator->id)->where('follows.created_at', '>=', $since);
        $subs = fn () => DB::table('payments')->where('creator_profile_id', $creator->id)->where('purpose', Payment::SUBSCRIPTION)->where('renewal', false)
            ->where('status', Payment::PAID)->where('paid_at', '>=', $since)->whereNotNull('source');
        $visits = fn () => DB::table('page_visits')->where('creator_profile_id', $creator->id)->where('day', '>=', $since->toDateString());

        // Free posts → follows → subscriptions.
        $followsByPost = $follows()->whereNotNull('source_post_id')->selectRaw('source_post_id as id, count(*) as n')->groupBy('source_post_id')->pluck('n', 'id');
        $subscribedByPost = $follows()->whereNotNull('follows.source_post_id')
            ->join('payments', fn ($j) => $j->on('payments.user_id', '=', 'follows.user_id')->on('payments.creator_profile_id', '=', 'follows.creator_profile_id'))
            ->where('payments.purpose', Payment::SUBSCRIPTION)->where('payments.status', Payment::PAID)->whereColumn('payments.paid_at', '>=', 'follows.created_at')
            ->selectRaw('follows.source_post_id as id, count(distinct follows.user_id) as n')->groupBy('follows.source_post_id')->pluck('n', 'id');
        $free = $creator->posts()->whereNull('price')->where('visibility', Post::PUBLIC)->published();
        $viewsByPost = DB::table('post_views')->whereIn('post_id', (clone $free)->select('id'))->where('day', '>=', $since->toDateString())
            ->selectRaw('post_id as id, count(*) as n')->groupBy('post_id')->pluck('n', 'id');
        $ids = $followsByPost->keys()->merge($viewsByPost->keys())->unique();
        $freePosts = $free->with('media')->whereIn('id', $ids)->get()
            ->map(fn (Post $p) => [
                'id' => $p->id,
                'body' => $p->body ? mb_strimwidth($p->body, 0, 90, '…') : null,
                'thumb' => (($m = $p->media->firstWhere('type', 'image')) ? route('media.show', $m) : null),
                'media' => $p->media->count(),
                'created_at' => $p->created_at->toIso8601String(),
                'views' => (int) ($viewsByPost[$p->id] ?? 0),
                'follows' => (int) ($followsByPost[$p->id] ?? 0),
                'subscribed' => (int) ($subscribedByPost[$p->id] ?? 0),
            ])
            ->sortByDesc(fn ($p) => [$p['follows'], $p['subscribed'], $p['views']])->values()->take(10)->all();

        // Places: visitors (for pages), follows and subscriptions clicked there.
        $key = fn ($source, $id) => $source.':'.(int) $id;
        $rows = [];
        $row = function (string $source, $id) use (&$rows, $key) {
            return $rows[$key($source, $id)] ??= ['source' => $source, 'id' => $id ? (int) $id : null, 'visitors' => null, 'follows' => 0, 'subscriptions' => 0, 'revenue' => 0];
        };
        foreach ($visits()->selectRaw('page, page_id, count(distinct viewer) as n')->groupBy('page', 'page_id')->get() as $v) {
            $row($v->page, $v->page_id);
            $rows[$key($v->page, $v->page_id)]['visitors'] = (int) $v->n;
        }
        foreach ($follows()->whereNotNull('source')->selectRaw('source, source_id, count(*) as n')->groupBy('source', 'source_id')->get() as $f) {
            $row($f->source, $f->source_id);
            $rows[$key($f->source, $f->source_id)]['follows'] = (int) $f->n;
        }
        foreach ($subs()->selectRaw('source, source_id, count(*) as n, sum(amount - platform_fee) as net')->groupBy('source', 'source_id')->get() as $s) {
            $row($s->source, $s->source_id);
            $rows[$key($s->source, $s->source_id)]['subscriptions'] = (int) $s->n;
            $rows[$key($s->source, $s->source_id)]['revenue'] = (int) $s->net;
        }
        // Names for series and posts.
        $seriesIds = collect($rows)->where('source', 'series')->pluck('id')->filter();
        $postIds = collect($rows)->where('source', 'post')->pluck('id')->filter();
        $seriesTitles = $seriesIds->isEmpty() ? collect() : $creator->series()->whereIn('id', $seriesIds)->pluck('title', 'id');
        $postBodies = $postIds->isEmpty() ? collect() : $creator->posts()->whereIn('id', $postIds)->pluck('body', 'id');
        $places = collect($rows)
            ->map(fn ($r) => [...$r, 'label' => match ($r['source']) {
                'series' => $seriesTitles[$r['id']] ?? null,
                'post' => isset($postBodies[$r['id']]) ? mb_strimwidth((string) $postBodies[$r['id']], 0, 60, '…') : null,
                default => null,
            }])
            ->sortByDesc(fn ($r) => [$r['subscriptions'], $r['follows'], $r['visitors'] ?? 0])->values()->all();

        // How people found the page.
        $refs = [];
        foreach ($visits()->selectRaw('referrer, count(distinct viewer) as n')->groupBy('referrer')->get() as $v) {
            $refs[$v->referrer] = ['referrer' => $v->referrer, 'visitors' => (int) $v->n, 'follows' => 0, 'subscriptions' => 0];
        }
        foreach ($follows()->whereNotNull('referrer')->selectRaw('referrer, count(*) as n')->groupBy('referrer')->get() as $f) {
            $refs[$f->referrer] ??= ['referrer' => $f->referrer, 'visitors' => 0, 'follows' => 0, 'subscriptions' => 0];
            $refs[$f->referrer]['follows'] = (int) $f->n;
        }
        foreach ($subs()->whereNotNull('referrer')->selectRaw('referrer, count(*) as n')->groupBy('referrer')->get() as $s) {
            $refs[$s->referrer] ??= ['referrer' => $s->referrer, 'visitors' => 0, 'follows' => 0, 'subscriptions' => 0];
            $refs[$s->referrer]['subscriptions'] = (int) $s->n;
        }
        $referrers = collect($refs)->sortByDesc(fn ($r) => [$r['subscriptions'], $r['follows'], $r['visitors']])->values()->take(12)->all();

        return compact('freePosts', 'places', 'referrers');
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
