<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use App\Support\Blocking;
use App\Support\Notify;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/** The fan side: home, discovering creators, following them, and the feed. */
class FanController extends Controller
{
    /** Home is the feed. Visitors log in first (with their phone number); creator pages stay public for sharing. */
    public function home(Request $request): Response|RedirectResponse
    {
        return $request->user() ? $this->feed($request) : to_route('login');
    }

    public function discover(Request $request): Response
    {
        $viewer = $request->user();
        $search = mb_substr(trim((string) $request->query('q', '')), 0, 60);
        $sort = $request->query('sort') === 'popular' ? 'popular' : 'new';

        $creators = CreatorProfile::listableFor($viewer)->withCount(['posts', 'followers'])
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('handle', 'like', '%'.ltrim(mb_strtolower($search), '@').'%')
                ->orWhere('display_name', 'like', "%{$search}%")
                ->orWhere('bio', 'like', "%{$search}%")))
            ->when($sort === 'popular', fn ($q) => $q->orderByDesc('followers_count'), fn ($q) => $q->latest('reviewed_at'))
            ->take(60)->get();

        return Inertia::render('creators/index', [
            'creators' => $creators->map->toCard($viewer),
            'filters' => ['q' => $search, 'sort' => $sort],
        ]);
    }

    public function follow(Request $request, string $handle): RedirectResponse
    {
        $creator = CreatorProfile::listableFor($request->user())->where('handle', $handle)->firstOrFail();
        abort_if($creator->user_id === $request->user()->id, 422, 'You can’t follow yourself.');
        abort_if(Blocking::between($creator->user, $request->user()), 404);
        $changes = $request->user()->following()->syncWithoutDetaching([$creator->id]);
        if ($changes['attached']) {
            Notify::followed($creator, $request->user());
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
            ->with(['media', 'creator.user:id,avatar_path'])->withEngagement($viewer)->latest()->latest('id')->take(50)->get()
            ->map(fn (Post $post) => $this->feedPost($post, $viewer));

        return Inertia::render('feed', [
            'posts' => $posts,
            'followingCount' => $ids->count(),
            'starterPosts' => $starter ? $this->starterPosts($viewer, $ids) : null,
        ]);
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
                ->latest('reviewed_at')->latest('id')->take($remaining)->get());
        }

        return $selected->map(function (CreatorProfile $creator) use ($viewer, $following, $topics) {
            $post = $creator->starterPost->setRelation('creator', $creator);

            return [
                ...$this->feedPost($post, $viewer),
                'topic' => $topics[$creator->handle] ?? null,
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
