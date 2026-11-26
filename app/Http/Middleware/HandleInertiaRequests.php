<?php

namespace App\Http\Middleware;

use App\Models\CreatorProfile;
use Illuminate\Foundation\Inspiring;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        [$message, $author] = str(Inspiring::quotes()->random())->explode('-');

        return array_merge(parent::share($request), [
            ...parent::share($request),
            'name' => config('app.name'),
            'locale' => fn () => app()->getLocale(),
            'quote' => ['message' => trim($message), 'author' => trim($author)],
            'auth' => [
                'user' => $request->user(),
                'creator' => fn () => $request->user()?->creatorProfile()->first(['handle', 'status', 'adult_content']),
            ],
            // Right-hand column of the social layout: a few creators the viewer doesn't follow yet.
            // "Санал болгох" (suggested creators) only appears on the home feed.
            'suggestions' => fn () => $request->routeIs('home', 'feed') ? $this->suggestions($request) : [],
            'flash' => ['status' => fn () => $request->session()->get('status')],
            'appearance' => fn () => \App\Support\Appearance::for($request),
            // The current CSRF token, for the few plain HTML form posts. The <meta> tag is only written on the first
            // page load, so after logging out (new session, new token) it goes stale and the post fails with 419.
            'csrf' => fn () => $request->session()->token(),
            'ppvLimits' => ['min' => (int) config('creators.min_ppv'), 'max' => (int) config('creators.max_ppv')],
            'tipLimits' => ['min' => (int) config('creators.min_tip'), 'max' => (int) config('creators.max_tip')],
            // What's waiting for admins (nav badge and admin tabs).
            'adminCounts' => fn () => $request->user()?->is_admin ? [
                'applications' => \App\Models\CreatorProfile::where('status', 'pending')->count(),
                'payouts' => \App\Models\Payout::where('status', 'requested')->count(),
                'reports' => \App\Models\Report::where('status', 'open')->count(),
            ] : null,
            'unreadNotifications' => fn () => $request->user()?->unreadNotifications()->count() ?? 0,
            'unreadMessages' => fn () => $request->user() ? \App\Models\Conversation::unreadCountFor($request->user()) : 0,
        ]);
    }

    private function suggestions(Request $request): array
    {
        $viewer = $request->user();

        return CreatorProfile::listableFor($viewer)
            ->when($viewer, fn ($q) => $q->where('user_id', '!=', $viewer->id)->whereNotIn('user_id', \App\Support\Blocking::idsAround($viewer))
                ->whereDoesntHave('followers', fn ($f) => $f->whereKey($viewer->id)))
            ->withCount(['posts', 'followers'])->orderByDesc('followers_count')->latest('reviewed_at')
            ->take(5)->get()->map->toCard($viewer)->all();
    }
}
