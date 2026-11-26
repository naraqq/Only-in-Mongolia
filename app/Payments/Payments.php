<?php

namespace App\Payments;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\Payment;
use App\Models\Post;
use App\Models\PromoCode;
use App\Models\Purchase;
use App\Models\Subscription;
use App\Models\User;
use App\Models\WalletEntry;
use App\Notifications\Activity;
use App\Support\Notify;
use Illuminate\Support\Facades\DB;

/**
 * Starting and settling payments. A payment is paid either through QPay (an invoice, settled when QPay says so)
 * or from the fan's wallet (paid on the spot). Settling is idempotent: a payment delivers what it bought exactly once.
 */
class Payments
{
    /** Provider name for payments taken from the wallet balance. */
    public const WALLET = 'wallet';

    public function __construct(private readonly PaymentGateway $gateway) {}

    public function gateway(): PaymentGateway
    {
        return $this->gateway;
    }

    /** $months subscription periods to $creator (1, or a bundle the creator offers). */
    public function startSubscription(User $fan, CreatorProfile $creator, int $months = 1, bool $fromWallet = false, ?PromoCode $promo = null): Payment
    {
        $price = $creator->priceFor($months);
        abort_if($price === null, 422, 'This bundle is not offered.');
        $paid = $promo ? $promo->apply($price) : $price;

        return $this->start($fan, $creator, Payment::SUBSCRIPTION, $paid,
            "Only in Mongolia: @{$creator->handle}, ".(config('creators.subscription_days') * $months).' хоног',
            ['months' => $months, 'promo_code_id' => $promo?->id, 'discount' => $price - $paid], $fromWallet);
    }

    /** A tip, optionally for one of the creator's posts and with a short note. */
    public function startTip(User $fan, CreatorProfile $creator, int $amount, ?Post $post = null, ?string $note = null, bool $fromWallet = false): Payment
    {
        return $this->start($fan, $creator, Payment::TIP, $amount, "Only in Mongolia: @{$creator->handle} tip", [
            'post_id' => $post?->id,
            'note' => $note,
        ], $fromWallet);
    }

    /** Unlock a pay-per-view post. */
    public function startPostPurchase(User $fan, Post $post, bool $fromWallet = false): Payment
    {
        return $this->start($fan, $post->creator, Payment::PPV, (int) $post->price, "Only in Mongolia: @{$post->creator->handle} post", ['post_id' => $post->id], $fromWallet);
    }

    /** Unlock a pay-per-view message from $creator. */
    public function startMessagePurchase(User $fan, CreatorProfile $creator, Message $message, bool $fromWallet = false): Payment
    {
        return $this->start($fan, $creator, Payment::PPV, (int) $message->price, "Only in Mongolia: @{$creator->handle} message", ['message_id' => $message->id], $fromWallet);
    }

    /** A QPay invoice that adds $amount to the fan's wallet once paid. No creator, no platform fee. */
    public function startTopup(User $fan, int $amount): Payment
    {
        $payment = Payment::create([
            'user_id' => $fan->id,
            'creator_profile_id' => null,
            'purpose' => Payment::TOPUP,
            'amount' => $amount,
            'platform_fee' => 0,
            'status' => Payment::PENDING,
            'provider' => $this->gateway->name(),
        ]);
        $payment->update($this->gateway->createInvoice($payment, 'Only in Mongolia: хэтэвч цэнэглэх', route('payments.callback', $payment)));

        return $payment;
    }

    /** @throws InsufficientBalance when paying from a wallet that holds too little */
    private function start(User $fan, CreatorProfile $creator, string $purpose, int $amount, string $description, array $extra, bool $fromWallet): Payment
    {
        $fields = [
            'user_id' => $fan->id,
            'creator_profile_id' => $creator->id,
            'purpose' => $purpose,
            'amount' => $amount,
            'platform_fee' => intdiv($amount * (int) config('creators.platform_fee_percent'), 100),
            ...$extra,
        ];

        if ($fromWallet) {
            // Take the money and deliver in one transaction: either both happen or neither does.
            return DB::transaction(function () use ($fan, $amount, $fields) {
                $payment = Payment::create([...$fields, 'status' => Payment::PAID, 'paid_at' => now(), 'provider' => self::WALLET]);
                Wallet::debit($fan, $amount, WalletEntry::SPEND, $payment);
                $this->deliver($payment);

                return $payment;
            });
        }

        $payment = Payment::create([...$fields, 'status' => Payment::PENDING, 'provider' => $this->gateway->name()]);
        $payment->update($this->gateway->createInvoice($payment, $description, route('payments.callback', $payment)));

        return $payment;
    }

    /** Ask the gateway; if paid, mark the payment and deliver what it bought. Safe to call any number of times. */
    public function settle(Payment $payment): Payment
    {
        if ($payment->status !== Payment::PENDING || ! $payment->invoice_id || ! $this->gateway->isPaid($payment)) {
            return $payment;
        }

        return DB::transaction(function () use ($payment) {
            $fresh = Payment::whereKey($payment->id)->lockForUpdate()->first();
            if ($fresh->status !== Payment::PENDING) {
                return $fresh; // another request settled it first (or it was refunded)
            }
            $fresh->update(['status' => Payment::PAID, 'paid_at' => now()]);
            $this->deliver($fresh);

            return $fresh;
        });
    }

    /** Give the fan what a just-paid payment bought, and tell the creator. Runs inside the paying transaction. */
    private function deliver(Payment $payment): void
    {
        if ($payment->purpose === Payment::TOPUP) {
            Wallet::credit($payment->user, $payment->amount, WalletEntry::TOPUP, $payment);

            return;
        }
        if ($payment->purpose === Payment::TIP) {
            $this->deliverTip($payment);
            Notify::paid($payment);

            return;
        }
        if ($payment->purpose === Payment::PPV) {
            Purchase::firstOrCreate(
                ['user_id' => $payment->user_id, 'post_id' => $payment->post_id, 'message_id' => $payment->message_id],
                ['payment_id' => $payment->id],
            );
            Notify::paid($payment);

            return;
        }

        if ($payment->promo_code_id) {
            PromoCode::whereKey($payment->promo_code_id)->increment('uses');
        }
        $sub = Subscription::firstOrNew(['user_id' => $payment->user_id, 'creator_profile_id' => $payment->creator_profile_id]);
        $renewed = $sub->expires_at && $sub->expires_at->isFuture();
        $from = $renewed ? $sub->expires_at : now(); // renewals add on to the current period
        $sub->expires_at = $from->copy()->addDays((int) config('creators.subscription_days') * max(1, $payment->months));
        $sub->save();
        Notify::paid($payment, $renewed);
    }

    /**
     * Admins: mark a paid payment refunded and take back what it bought (that subscription period, or the unlock).
     * Wallet payments go straight back to the wallet. A refunded top-up comes out of the wallet (not if it's been spent).
     * QPay money goes back to the fan outside the app (QPay merchant panel or a bank transfer).
     */
    public function refund(Payment $payment, User $admin, string $reason): Payment
    {
        return DB::transaction(function () use ($payment, $admin, $reason) {
            $fresh = Payment::whereKey($payment->id)->lockForUpdate()->first();
            abort_unless($fresh->isPaid(), 409, 'Only paid payments can be refunded.');

            if ($fresh->purpose === Payment::TOPUP) {
                try {
                    Wallet::debit($fresh->user, $fresh->amount, WalletEntry::REVERSAL, $fresh, $reason);
                } catch (InsufficientBalance) {
                    abort(409, 'This top-up has already been spent.');
                }
            }
            $fresh->update(['status' => Payment::REFUNDED, 'refunded_at' => now(), 'refunded_by' => $admin->id, 'refund_reason' => $reason]);
            if ($fresh->provider === self::WALLET) {
                Wallet::credit($fresh->user, $fresh->amount, WalletEntry::REFUND, $fresh, $reason);
            }

            if ($fresh->purpose === Payment::SUBSCRIPTION) {
                $sub = Subscription::where('user_id', $fresh->user_id)->where('creator_profile_id', $fresh->creator_profile_id)->first();
                if ($sub?->expires_at) {
                    $end = $sub->expires_at->copy()->subDays((int) config('creators.subscription_days') * max(1, $fresh->months));
                    $sub->update(['expires_at' => $end->isFuture() ? $end : now()]);
                }
            }
            if ($fresh->purpose === Payment::PPV) {
                Purchase::where('payment_id', $fresh->id)->delete();
            }

            $creator = $fresh->creator;
            $fresh->user->notify(new Activity('refunded', $creator?->user_id ?? $admin->id, array_filter([
                'amount' => $fresh->amount, 'handle' => $creator?->handle, 'note' => $reason,
            ])));
            $creator?->user->notify(new Activity('charge_refunded', $fresh->user_id, [
                'amount' => $fresh->amount, 'note' => $reason,
            ]));

            return $fresh;
        });
    }

    /** A paid tip appears in the fan's chat with the creator, so the creator sees who tipped and can say thanks. */
    private function deliverTip(Payment $payment): void
    {
        $creatorUser = $payment->creator->user;
        $conversation = Conversation::between($payment->user, $creatorUser);
        $conversation->messages()->create([
            'sender_id' => $payment->user_id,
            'body' => $payment->note,
            'tip_amount' => $payment->amount,
        ]);
        $conversation->forceFill(['last_message_at' => now()])->saveQuietly();
        $conversation->markRead($payment->user);
    }
}
