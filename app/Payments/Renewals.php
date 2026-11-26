<?php

namespace App\Payments;

use App\Models\CreatorProfile;
use App\Models\Subscription;
use App\Notifications\Activity;
use App\Support\Blocking;
use Illuminate\Support\Facades\DB;

/**
 * QPay can't charge a card on its own, so renewals come from the wallet: for subscriptions with auto-renew on,
 * pay one more month from the fan's balance in the last day before access ends. If the balance is short,
 * tell the fan once per period so they can top up in time.
 */
class Renewals
{
    /** How long before the end we renew (and how often the job should run to never miss one). */
    public const WINDOW_HOURS = 24;

    public function __construct(private readonly Payments $payments) {}

    /** @return array{renewed: int, short: int, skipped: int} */
    public function run(): array
    {
        $tally = ['renewed' => 0, 'short' => 0, 'skipped' => 0];

        Subscription::with(['user', 'creator.user'])
            ->where('auto_renew', true)
            ->whereBetween('expires_at', [now(), now()->addHours(self::WINDOW_HOURS)])
            ->chunkById(100, function ($subs) use (&$tally) {
                foreach ($subs as $sub) {
                    $tally[$this->renew($sub)]++;
                }
            });

        return $tally;
    }

    /** @return 'renewed'|'short'|'skipped' */
    public function renew(Subscription $sub): string
    {
        $creator = $sub->creator;
        $fan = $sub->user;
        // Creator gone or suspended, or one blocked the other: stop renewing.
        if (! $fan || ! $creator || $creator->status !== CreatorProfile::APPROVED || Blocking::between($creator->user, $fan) || $fan->banned_at) {
            $sub->update(['auto_renew' => false]);

            return 'skipped';
        }

        try {
            $payment = $this->payments->startSubscription($fan, $creator, 1, fromWallet: true);
        } catch (InsufficientBalance) {
            $this->tellShortOnce($sub);

            return 'short';
        }

        $fan->notify(new Activity('auto_renewed', $creator->user_id, [
            'handle' => $creator->handle, 'amount' => $payment->amount, 'expires_at' => $sub->fresh()->expires_at->toIso8601String(),
        ]));

        return 'renewed';
    }

    /** "Not enough in your wallet to renew @x": once per subscription period, not every hour. */
    private function tellShortOnce(Subscription $sub): void
    {
        $until = $sub->expires_at->toIso8601String();
        $already = DB::table('notifications')->where('notifiable_id', $sub->user_id)->where('type', 'renew_failed')
            ->where('data', 'like', '%'.trim(json_encode($until), '"').'%')
            ->where('data', 'like', '%"handle":'.json_encode($sub->creator->handle).'%')->exists();
        if (! $already) {
            $sub->user->notify(new Activity('renew_failed', $sub->creator->user_id, [
                'handle' => $sub->creator->handle, 'amount' => $sub->creator->price_monthly, 'expires_at' => $until,
            ]));
        }
    }
}
