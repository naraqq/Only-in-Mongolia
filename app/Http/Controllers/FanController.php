<?php

namespace App\Http\Controllers;

use App\Discovery\Suggestions;
use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use App\Support\Attribution;
use App\Support\Blocking;
use App\Support\Notify;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/** The fan side: home, discovering creators, following them, and the feed. */
class FanController extends Controller
{
    /** Posts per page of the home feed (more load as the fan scrolls). */
    private const PAGE = 20;

    /** Home is the feed. Visitors log in first (with their phone number); creator pages stay public for sharing. */
    public function home(Request $request): Response|RedirectResponse
    {
        return $request->user() ? $this->feed($request) : to_route('login');
    }

    public function discover(Request $request): Response
    {
        $viewer = $request->user();
        $search = mb_substr(trim((string) $request->query('q', '')), 0, 60);
        $sort = in_array($request->query('sort'), ['popular', 'new'], true) ? $request->query('sort') : 'trending';
        $category = in_array($request->query('category'), config('creators.categories'), true) ? $request->query('category') : null;

        $creators = CreatorProfile::listableFor($viewer)->withCount(['posts', 'followers'])
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('handle', 'like', '%'.ltrim(mb_strtolower($search), '@').'%')
                ->orWhere('display_name', 'like', "%{$search}%")
                ->orWhere('bio', 'like', "%{$search}%")))
            ->when($category, fn ($q) => $q->inCategory($category))
            ->when($sort === 'trending', fn ($q) => $q->trending()->latest('reviewed_at'))
            ->when($sort === 'popular', fn ($q) => $q->orderByDesc('followers_count'))
            ->when($sort === 'new', fn ($q) => $q->latest('reviewed_at'))
            ->take(60)->get();

        // Which categories have pages, for the filter (only those, so no empty choices).
        $used = CreatorProfile::listableFor($viewer)->whereNotNull('categories')->pluck('categories')->flatten()->countBy();

        return Inertia::render('creators/index', [
            'creators' => $creators->map->toCard($viewer),
            'filters' => ['q' => $search, 'sort' => $sort, 'category' => $category],
            'categories' => collect(config('creators.categories'))->filter(fn ($c) => $used->has($c))->values(),
        ]);
    }

    public function follow(Request $request, string $handle): RedirectResponse
    {
        $creator = CreatorProfile::listableFor($request->user())->where('handle', $handle)->firstOrFail();
        abort_if($creator->user_id === $request->user()->id, 422, 'You can’t follow yourself.');
        abort_if(Blocking::between($creator->user, $request->user()), 404);
        $fan = $request->user();
        if (! $fan->following()->whereKey($creator->id)->exists()) {
            try {
                // Remember where the follow came from, for the creator's conversion insights.
                $fan->following()->attach($creator->id, Attribution::forFollow($request, $fan, $creator));
                Notify::followed($creator, $fan);
            } catch (UniqueConstraintViolationException) {
                // a double click: the first one already followed
            }
        }

        return $request->query('view') === 'starter' ? to_route('home', ['view' => 'starter']) : back();
    }

    public function unfollow(Request $request, string $handle): RedirectResponse
    {
        $creator = CreatorProfile::where('handle', $handle)->firstOrFail();
        $request->user()->following()->detach($creator->id);

        return $request->query('view') === 'starter' ? to_route('home', ['view' => 'starter']) : back();
    }

    /** Newest posts from everyone the user follows (plus their own, if they're a creator); locked ones arrive as tiles. */
    public function feed(Request $request): Response
    {
        $viewer = $request->user();
        $ids = $viewer->following()->where('status', CreatorProfile::APPROVED)->pluck('creator_profiles.id');

        $own = $viewer->creatorProfile()->where('status', CreatorProfile::APPROVED)->value('id');
        $starter = ! $own && ($ids->isEmpty() || $request->query('view') === 'starter');

        $posts = $starter ? [] : Post::published()->whereIn('creator_profile_id', $ids->when($own, fn ($c) => $c->merge([$own])))
            ->with(['media', 'creator.user:id,avatar_path'])->withEngagement($viewer)->latest()->latest('id')->take(self::PAGE)->get()
            ->map(fn (Post $post) => $this->feedPost($post, $viewer));

        return Inertia::render('feed', [
            'posts' => $posts,
            'followingCount' => $ids->count(),
            'starterPosts' => $starter ? $this->starterPosts($viewer, $ids) : null,
        ]);
    }

    /**
     * The next posts of the home feed, older than post $before (newest first, as on the page). When there are no
     * more, `suggested`: recent free posts from creators they might like (App\Discovery\Suggestions).
     */
    public function feedMore(Request $request): JsonResponse
    {
        $viewer = $request->user();
        $before = Post::find((int) $request->query('before'));
        $ids = $viewer->following()->where('status', CreatorProfile::APPROVED)->pluck('creator_profiles.id');
        $own = $viewer->creatorProfile()->where('status', CreatorProfile::APPROVED)->value('id');
        $posts = collect();
        if ($before) {
            $posts = Post::published()->whereIn('creator_profile_id', $ids->when($own, fn ($c) => $c->merge([$own])))
                ->where(fn ($q) => $q->where('created_at', '<', $before->created_at)
                    ->orWhere(fn ($w) => $w->where('created_at', $before->created_at)->where('id', '<', $before->id)))
                ->with(['media', 'creator.user:id,avatar_path'])->withEngagement($viewer)->latest()->latest('id')->take(self::PAGE)->get();
        }

        return response()->json([
            'posts' => $posts->map(fn (Post $post) => $this->feedPost($post, $viewer))->values(),
            'done' => $posts->count() < self::PAGE,
            'suggested' => $posts->count() < self::PAGE ? $this->suggestedPosts($viewer) : [],
        ]);
    }

    /** One recent free post from each of the creators suggested to them, for "you might also like". */
    private function suggestedPosts(User $viewer): array
    {
        $creators = Suggestions::for($viewer, 8)->filter(fn (CreatorProfile $c) => ! $c->adult_content)->pluck('id');
        if ($creators->isEmpty()) {
            return [];
        }

        return CreatorProfile::whereIn('id', $creators)->whereHas('starterPost')
            ->with(['starterPost' => fn ($q) => $q->with('media')->withEngagement($viewer), 'user:id,avatar_path'])->get()
            ->sortBy(fn ($c) => $creators->search($c->id))
            ->map(fn (CreatorProfile $c) => $this->feedPost($c->starterPost->setRelation('creator', $c), $viewer))->values()->all();
    }

    private function starterPosts(User $viewer, Collection $following): array
    {
        $topics = config('starter-feed.topics_by_handle');
        $eligible = CreatorProfile::listableFor($viewer)->where('adult_content', false)
            ->where('user_id', '!=', $viewer->id)->whereNotIn('user_id', Blocking::idsAround($viewer))
            ->whereHas('starterPost')->with(['starterPost' => fn ($query) => $query->with('media')->withEngagement($viewer)]);

        $curated = (clone $eligible)->whereIn('handle', array_keys($topics))->get()->keyBy('handle');
        $selected = collect(array_keys($topics))->map(fn ($handle) => $curated->get($handle))->filter()->take(12);
        $remaining = 12 - $selected->count();
        if ($remaining > 0) {
            $selected = $selected->concat((clone $eligible)->whereNotIn('handle', array_keys($topics))
                ->trending()->latest('reviewed_at')->take($remaining)->get());
        }

        return $selected->map(function (CreatorProfile $creator) use ($viewer, $following, $topics) {
            $post = $creator->starterPost->setRelation('creator', $creator);

            return [
                ...$this->feedPost($post, $viewer),
                'topic' => $creator->categories[0] ?? $topics[$creator->handle] ?? null,
                'following' => $following->contains($creator->id),
            ];
        })->values()->all();
    }

    private function feedPost(Post $post, User $viewer): array
    {
        return [
            ...CreatorPageController::present($post, $viewer),
            'author' => [
                'name' => $post->creator->display_name,
                'handle' => $post->creator->handle,
                'price' => $post->creator->price_monthly,
                'avatar_url' => $post->creator->avatarUrl(),
            ],
        ];
    }

    public function dashboard(Request $request): Response
    {
        $viewer = $request->user();

        return Inertia::render('dashboard', [
            'subscriptions' => $viewer->subscriptions()->active()->with('creator.user:id,avatar_path')->orderBy('expires_at')->get()
                ->map(fn ($s) => [
                    'handle' => $s->creator->handle,
                    'display_name' => $s->creator->display_name,
                    'price_monthly' => $s->creator->price_monthly,
                    'avatar_url' => $s->creator->avatarUrl(),
                    'expires_at' => $s->expires_at->toIso8601String(),
                ]),
            'creatorStatus' => $viewer->creatorProfile()->value('status'),
            'following' => $viewer->following()->where('status', CreatorProfile::APPROVED)->withCount(['posts', 'followers'])
                ->latest('follows.created_at')->take(20)->get()->map->toCard($viewer),
        ]);
    }
}
