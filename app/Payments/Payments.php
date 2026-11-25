<?php

namespace App\Payments;

use App\Models\CreatorProfile;
use App\Models\Payment;
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
        $payment = Payment::create([
            'user_id' => $fan->id,
            'creator_profile_id' => $creator->id,
            'purpose' => 'subscription',
            'amount' => $creator->price_monthly,
            'platform_fee' => intdiv($creator->price_monthly * (int) config('creators.platform_fee_percent'), 100),
            'status' => Payment::PENDING,
            'provider' => $this->gateway->name(),
        ]);

        $invoice = $this->gateway->createInvoice(
            $payment,
            "Only in Mongolia: @{$creator->handle}, ".config('creators.subscription_days').' хоног',
            route('payments.callback', $payment),
        );
        $payment->update($invoice);

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

            $sub = Subscription::firstOrNew(['user_id' => $fresh->user_id, 'creator_profile_id' => $fresh->creator_profile_id]);
            $from = $sub->expires_at && $sub->expires_at->isFuture() ? $sub->expires_at : now(); // renewals add on to the current period
            $sub->expires_at = $from->copy()->addDays((int) config('creators.subscription_days'));
            $sub->save();

            return $fresh;
        });
    }
}
