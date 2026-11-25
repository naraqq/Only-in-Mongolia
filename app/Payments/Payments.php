<?php

namespace App\Payments;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Starting and settling payments. Settling is idempotent: a payment extends a subscription exactly once. */
class Payments
{
    public function __construct(private readonly PaymentGateway $gateway) {}

    public function gateway(): PaymentGateway
    {
        return $this->gateway;
    }

    /** A new invoice for one subscription period to $creator. */
    public function startSubscription(User $fan, CreatorProfile $creator): Payment
    {
        return $this->start($fan, $creator, Payment::SUBSCRIPTION, $creator->price_monthly,
            "Only in Mongolia: @{$creator->handle}, ".config('creators.subscription_days').' хоног');
    }

    /** A new invoice for a tip, optionally for one of the creator's posts and with a short note. */
    public function startTip(User $fan, CreatorProfile $creator, int $amount, ?Post $post = null, ?string $note = null): Payment
    {
        return $this->start($fan, $creator, Payment::TIP, $amount, "Only in Mongolia: @{$creator->handle} tip", [
            'post_id' => $post?->id,
            'note' => $note,
        ]);
    }

    private function start(User $fan, CreatorProfile $creator, string $purpose, int $amount, string $description, array $extra = []): Payment
    {
        $payment = Payment::create([
            'user_id' => $fan->id,
            'creator_profile_id' => $creator->id,
            'purpose' => $purpose,
            'amount' => $amount,
            'platform_fee' => intdiv($amount * (int) config('creators.platform_fee_percent'), 100),
            'status' => Payment::PENDING,
            'provider' => $this->gateway->name(),
            ...$extra,
        ]);

        $payment->update($this->gateway->createInvoice($payment, $description, route('payments.callback', $payment)));

        return $payment;
    }

    /** Ask the gateway; if paid, mark the payment and extend the subscription. Safe to call any number of times. */
    public function settle(Payment $payment): Payment
    {
        if ($payment->isPaid() || ! $payment->invoice_id || ! $this->gateway->isPaid($payment)) {
            return $payment;
        }

        return DB::transaction(function () use ($payment) {
            $fresh = Payment::whereKey($payment->id)->lockForUpdate()->first();
            if ($fresh->isPaid()) {
                return $fresh; // another request settled it first
            }
            $fresh->update(['status' => Payment::PAID, 'paid_at' => now()]);

            if ($fresh->purpose === Payment::TIP) {
                $this->deliverTip($fresh);

                return $fresh;
            }

            $sub = Subscription::firstOrNew(['user_id' => $fresh->user_id, 'creator_profile_id' => $fresh->creator_profile_id]);
            $from = $sub->expires_at && $sub->expires_at->isFuture() ? $sub->expires_at : now(); // renewals add on to the current period
            $sub->expires_at = $from->copy()->addDays((int) config('creators.subscription_days'));
            $sub->save();

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
