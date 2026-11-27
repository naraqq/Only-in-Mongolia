<?php

namespace App\Support;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use App\Notifications\Activity;
use App\Push\Push;
use App\Push\SendPush;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** The places that create notifications, in one file. */
class Notify
{
    public static function followed(CreatorProfile $creator, User $fan): void
    {
        $creator->user->notify(new Activity('followed', $fan->id));
    }

    /** A settled payment: tell the creator who subscribed, tipped or bought what. */
    public static function paid(Payment $payment, bool $renewed = false): void
    {
        $kind = match ($payment->purpose) {
            Payment::TIP => 'tipped',
            Payment::PPV => 'purchased',
            default => 'subscribed',
        };
        $payment->creator->user->notify(new Activity($kind, $payment->user_id, array_filter([
            'amount' => $payment->amount,
            'renewed' => $renewed ?: null,
            'note' => $payment->note,
            'post_id' => $payment->post_id,
            'conversation_id' => $payment->message?->conversation_id,
        ], fn ($v) => $v !== null)));
    }

    /**
     * A new post: every active subscriber hears about it. Written in bulk (one insert per 500 people)
     * so a creator with many subscribers doesn't make posting slow.
     */
    public static function newPost(Post $post): void
    {
        $creator = $post->creator;
        $now = now();
        $data = json_encode(['actor_id' => $creator->user_id, 'post_id' => $post->id, 'handle' => $creator->handle]);

        $creator->subscriptions()->active()->where('user_id', '!=', $creator->user_id)->select('id', 'user_id')
            ->chunkById(500, function ($subs) use ($data, $now) {
                DB::table('notifications')->insert($subs->map(fn ($s) => [
                    'id' => (string) Str::uuid(),
                    'type' => 'new_post',
                    'notifiable_type' => User::class,
                    'notifiable_id' => $s->user_id,
                    'data' => $data,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all());
                // And a push to the phones of those who allowed it (one job per 500 people).
                Live::user($subs->pluck('user_id')->all(), 'notification');
                if (Push::enabled()) {
                    SendPush::dispatch($subs->pluck('user_id')->all(), 'new_post', ['name' => $creator->display_name], route('creator.show', $creator->handle), 'post-'.$creator->id);
                }
            });
    }

    /** A live Q&A just started: tell everyone who asked to be reminded (in bulk, like new posts). */
    public static function qaLive(Post $post): void
    {
        $creator = $post->creator;
        $now = now();
        $data = json_encode(['actor_id' => $creator->user_id, 'post_id' => $post->id, 'handle' => $creator->handle]);

        DB::table('qa_rsvps')->where('post_id', $post->id)->where('user_id', '!=', $creator->user_id)->orderBy('user_id')
            ->chunk(500, function ($rsvps) use ($data, $now, $creator, $post) {
                DB::table('notifications')->insert($rsvps->map(fn ($r) => [
                    'id' => (string) Str::uuid(),
                    'type' => 'qa_live',
                    'notifiable_type' => User::class,
                    'notifiable_id' => $r->user_id,
                    'data' => $data,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all());
                Live::user($rsvps->pluck('user_id')->all(), 'notification');
                if (Push::enabled()) {
                    SendPush::dispatch($rsvps->pluck('user_id')->all(), 'qa_live', ['name' => $creator->display_name],
                        route('creator.show', ['handle' => $creator->handle, 'focus' => $post->id]), 'qa-'.$post->id);
                }
            });
    }

    /** "Your subscription to X ends on …" for the fan. */
    public static function expiring(User $fan, CreatorProfile $creator, string $expiresAt): void
    {
        $fan->notify(new Activity('expiring', $creator->user_id, ['handle' => $creator->handle, 'expires_at' => $expiresAt]));
    }
}
