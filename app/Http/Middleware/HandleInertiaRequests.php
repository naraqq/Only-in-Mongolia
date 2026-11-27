<?php

namespace App\Http\Middleware;

use App\Discovery\Suggestions;
use App\Models\Ad;
use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Payout;
use App\Models\Report;
use App\Push\Push;
use App\Support\Appearance;
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
                // The company this person advertises for: the "Business" area.
                'company' => fn () => ($c = $request->user()?->company) ? ['name' => $c->name, 'logo' => $c->logoUrl()] : null,
            ],
            // Right-hand column of the social layout: a few creators the viewer doesn't follow yet.
            // "Санал болгох" (suggested creators) only appears on the home feed.
            'suggestions' => fn () => $request->routeIs('home', 'feed') ? $this->suggestions($request) : [],
            'flash' => ['status' => fn () => $request->session()->get('status')],
            'appearance' => fn () => Appearance::for($request),
            // The current CSRF token, for the few plain HTML form posts. The <meta> tag is only written on the first
            // page load, so after logging out (new session, new token) it goes stale and the post fails with 419.
            'csrf' => fn () => $request->session()->token(),
            'ppvLimits' => ['min' => (int) config('creators.min_ppv'), 'max' => (int) config('creators.max_ppv')],
            'tipLimits' => ['min' => (int) config('creators.min_tip'), 'max' => (int) config('creators.max_tip')],
            // What's waiting for admins (nav badge and admin tabs).
            'adminCounts' => fn () => $request->user()?->is_admin ? [
                'applications' => CreatorProfile::where('status', 'pending')->count(),
                'payouts' => Payout::where('status', 'requested')->count(),
                'reports' => Report::where('status', 'open')->count(),
                'ads' => Ad::where('review_status', Ad::PENDING)->count(),
            ] : null,
            // Real-time updates: where the browser connects (null = Reverb not set up; pages fall back to polling).
            // The key is public by design (every browser gets it); the secret never leaves the server.
            'reverb' => config('broadcasting.default') === 'reverb' && config('broadcasting.connections.reverb.key') ? [
                'key' => config('broadcasting.connections.reverb.key'),
                'host' => config('broadcasting.connections.reverb.browser.host') ?: null,
                'port' => (int) config('broadcasting.connections.reverb.browser.port') ?: null,
                'scheme' => config('broadcasting.connections.reverb.browser.scheme') ?: null,
            ] : null,
            // The public key browsers need to subscribe to push (null = push not set up on this server).
            'pushKey' => Push::enabled() ? config('services.webpush.public_key') : null,
            'unreadNotifications' => fn () => $request->user()?->unreadNotifications()->count() ?? 0,
            'unreadMessages' => fn () => $request->user() ? Conversation::unreadCountFor($request->user()) : 0,
        ]);
    }

    private function suggestions(Request $request): array
    {
        $viewer = $request->user();

        // Personal: fans of who they follow, the same topics, then what's trending (App\Discovery\Suggestions).
        return Suggestions::for($viewer, 5)->map->toCard($viewer)->all();
    }
}
