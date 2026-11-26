<?php

namespace App\Notifications;

use App\Models\User;
use App\Push\Push;
use App\Push\SendPush;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * One item in someone's notifications (the bell). Stored in the database only.
 *
 * kind: followed | subscribed | tipped | purchased | new_post | expiring
 * data: actor_id (who did it), plus kind-specific fields: amount, renewed, note, post_id, conversation_id, expires_at.
 * The text is written by the browser in the reader's language.
 */
class Activity extends Notification
{
    use Queueable;

    public function __construct(public string $kind, public int $actorId, public array $data = []) {}

    public function via(object $notifiable): array
    {
        return $notifiable instanceof User && Push::wants($notifiable) ? ['database', Push::class] : ['database'];
    }

    /** The same news as a push to the person's phone, opening the bell (where it shows as new). */
    public function toPush(User $notifiable): SendPush
    {
        $actor = User::with('creatorProfile:id,user_id,display_name,status')->find($this->actorId);
        $name = $actor?->creatorProfile?->status === 'approved' ? $actor->creatorProfile->display_name : $actor?->name;
        $key = $this->kind === 'subscribed' && ! empty($this->data['renewed']) ? 'renewed' : $this->kind;

        return new SendPush([$notifiable->id], $key, [
            'name' => $name ?? '',
            'amount' => $this->data['amount'] ?? null,
            'date' => $this->data['expires_at'] ?? null,
        ], route('notifications'), 'activity');
    }

    public function databaseType(object $notifiable): string
    {
        return $this->kind;
    }

    public function toArray(object $notifiable): array
    {
        return ['actor_id' => $this->actorId, ...$this->data];
    }
}
