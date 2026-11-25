<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Post;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
        $request->user()->following()->syncWithoutDetaching([$creator->id]);

        return back();
    }

    public function unfollow(Request $request, string $handle): RedirectResponse
    {
        $creator = CreatorProfile::where('handle', $handle)->firstOrFail();
        $request->user()->following()->detach($creator->id);

        return back();
    }

    /** Newest posts from everyone the user follows (plus their own, if they're a creator); locked ones arrive as tiles. */
    public function feed(Request $request): Response
    {
        $viewer = $request->user();
        $ids = $viewer->following()->where('status', CreatorProfile::APPROVED)->pluck('creator_profiles.id');

        $own = $viewer->creatorProfile()->where('status', CreatorProfile::APPROVED)->value('id');

        $posts = Post::whereIn('creator_profile_id', $ids->when($own, fn ($c) => $c->merge([$own])))->with(['media', 'creator.user:id,avatar_path'])->latest()->latest('id')->take(50)->get()
            ->map(fn (Post $p) => [
                ...CreatorPageController::present($p, $viewer),
                'author' => ['name' => $p->creator->display_name, 'handle' => $p->creator->handle, 'price' => $p->creator->price_monthly, 'avatar_url' => $p->creator->avatarUrl()],
            ]);

        return Inertia::render('feed', [
            'posts' => $posts,
            'followingCount' => $ids->count(),
        ]);
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
