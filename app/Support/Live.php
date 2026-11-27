<?php

namespace App\Support;

use App\Events\LivePing;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\PrivateChannel;
use Throwable;

/**
 * Real-time updates (Laravel Reverb). Every ping only says what changed, never the content, and a ping that
 * can't be sent (Reverb down, not configured) is logged and ignored: pages fall back to checking now and then,
 * so a message is never lost and sending one never fails because of this.
 *
 * Channels (authorised in routes/channels.php):
 *   user.{id}              private  your bell and message badges, your inbox list
 *   conversation.{id}      private  a chat's new messages
 *   qa.{postId}            public   a live Q&A's questions and answers (the content is fetched with permission checks)
 */
class Live
{
    /** Someone's bell, inbox or badges changed. @param int|list<int> $userIds */
    public static function user(int|array $userIds, string $what): void
    {
        $ids = array_values(array_unique((array) $userIds));
        foreach (array_chunk($ids, 100) as $chunk) {
            self::send(array_map(fn ($id) => new PrivateChannel('user.'.$id), $chunk), $what);
        }
    }

    /** A new message (or a change) in a conversation. */
    public static function conversation(int $conversationId): void
    {
        self::send([new PrivateChannel('conversation.'.$conversationId)], 'message', ['conversation' => $conversationId]);
    }

    /** A live Q&A's list changed. */
    public static function qa(int $postId): void
    {
        self::send([new Channel('qa.'.$postId)], 'qa');
    }

    /** @param  list<Channel>  $channels */
    private static function send(array $channels, string $name, array $data = []): void
    {
        if (! $channels || in_array(config('broadcasting.default'), ['null', null], true)) {
            return;
        }
        try {
            broadcast(new LivePing($channels, $name, $data));
        } catch (Throwable $e) {
            report($e);
        }
    }
}
