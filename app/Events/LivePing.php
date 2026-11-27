<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * "Something changed here": a tiny real-time nudge with no private content. The browser reacts by reloading the
 * piece it shows through the normal routes, which do all the permission checks. Sent straight away (not queued),
 * so it arrives in well under a second.
 */
class LivePing implements ShouldBroadcastNow
{
    /** @param  list<Channel>  $channels */
    public function __construct(public array $channels, public string $name, public array $data = []) {}

    public function broadcastOn(): array
    {
        return $this->channels;
    }

    public function broadcastAs(): string
    {
        return $this->name;
    }

    public function broadcastWith(): array
    {
        return $this->data;
    }
}
