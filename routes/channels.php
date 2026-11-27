<?php

use App\Models\Conversation;
use Illuminate\Support\Facades\Broadcast;

/*
 * Who may listen to which real-time channel (see App\Support\Live). Pings carry no content, but private
 * channels still only open for the people they're about.
 */

// Your own bell, badges and inbox.
Broadcast::channel('user.{id}', fn ($user, $id) => (int) $user->id === (int) $id && ! $user->banned_at);

// A chat: only its two people.
Broadcast::channel('conversation.{conversation}', fn ($user, Conversation $conversation) => $conversation->includes($user) && ! $user->banned_at);
