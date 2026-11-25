<?php

namespace App\Notifications;

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
        return ['database'];
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
