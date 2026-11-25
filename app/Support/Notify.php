<?php

namespace App\Support;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use App\Notifications\Activity;
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
            });
    }

    /** "Your subscription to X ends on …" for the fan. */
    public static function expiring(User $fan, CreatorProfile $creator, string $expiresAt): void
    {
        $fan->notify(new Activity('expiring', $creator->user_id, ['handle' => $creator->handle, 'expires_at' => $expiresAt]));
    }
}
