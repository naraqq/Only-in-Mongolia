<?php

namespace App\Http\Controllers;

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Inertia\Inertia;
use Inertia\Response;

/** The bell: newest notifications first. Opening the page marks them all read (they still show as new this once). */
class NotificationController extends Controller
{
    public function index(Request $request): Response
    {
        $me = $request->user();
        $items = $me->notifications()->latest()->take(60)->get();
        $actors = User::with('creatorProfile:id,user_id,handle,display_name,status')
            ->whereIn('id', $items->pluck('data.actor_id')->filter()->unique())->get()->keyBy('id');

        $list = $items->map(function (DatabaseNotification $n) use ($actors, $me) {
            $actor = $actors[$n->data['actor_id'] ?? 0] ?? null;
            $creator = $actor?->creatorProfile?->status === 'approved' ? $actor->creatorProfile : null;

            return [
                'id' => $n->id,
                'kind' => $n->type,
                'read' => $n->read_at !== null,
                'at' => $n->created_at->toIso8601String(),
                'data' => collect($n->data)->only('amount', 'renewed', 'note', 'expires_at')->all(),
                'actor' => $actor ? [
                    'name' => $creator?->display_name ?? $actor->name,
                    'handle' => $creator?->handle,
                    'avatar_url' => $actor->avatar_url,
                ] : null,
                'url' => $this->url($n, $actor, $me),
            ];
        });

        $me->unreadNotifications()->update(['read_at' => now()]);

        return Inertia::render('notifications/index', ['notifications' => $list]);
    }

    /** Where tapping a notification goes. */
    private function url(DatabaseNotification $n, ?User $actor, User $me): ?string
    {
        $d = $n->data;

        return match ($n->type) {
            'new_post', 'expiring', 'commented', 'replied' => isset($d['handle']) ? route('creator.show', $d['handle']) : null,
            'trial_started' => route('studio'),
            'tipped', 'subscribed', 'followed' => $actor && ($c = Conversation::findBetween($me, $actor)) ? route('messages.show', $c) : route('studio'),
            'payout_paid', 'payout_rejected', 'charge_refunded' => route('studio.earnings'),
            'auto_renewed', 'renew_failed' => route('wallet'),
            'refunded' => isset($d['handle']) ? route('creator.show', $d['handle']) : null,
            'purchased' => isset($d['conversation_id']) ? route('messages.show', $d['conversation_id']) : route('studio'),
            default => null,
        };
    }
}
