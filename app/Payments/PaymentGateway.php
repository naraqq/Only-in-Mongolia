<?php

namespace App\Payments;

use App\Models\Payment;

interface PaymentGateway
{
    /** Short name stored on the payment: "qpay" or "fake". */
    public function name(): string;

    /**
     * Create an invoice for the payment.
     *
     * @return array{invoice_id: string, qr_text: ?string, qr_image: ?string, bank_links: array<int, array{name: string, description: string, logo: string, link: string}>}
     */
    public function createInvoice(Payment $payment, string $description, string $callbackUrl): array;

    /** Ask the provider whether the invoice has been paid in full. Never trust callbacks without this. */
    public function isPaid(Payment $payment): bool;
}
