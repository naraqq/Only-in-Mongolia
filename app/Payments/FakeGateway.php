<?php

namespace App\Payments;

use App\Models\Payment;
use Illuminate\Support\Facades\Cache;

/**
 * DEV ONLY: stands in for QPay when no merchant account is configured (never in production).
 * The checkout page shows a "pay (dev)" button that marks the invoice as paid.
 */
class FakeGateway implements PaymentGateway
{
    public function name(): string
    {
        return 'fake';
    }

    public function createInvoice(Payment $payment, string $description, string $callbackUrl): array
    {
        return ['invoice_id' => 'FAKE-'.$payment->id, 'qr_text' => null, 'qr_image' => null, 'bank_links' => []];
    }

    public function isPaid(Payment $payment): bool
    {
        return Cache::get("fake-pay.{$payment->id}") === true;
    }

    public static function markPaid(Payment $payment): void
    {
        Cache::put("fake-pay.{$payment->id}", true, now()->addDay());
    }
}
