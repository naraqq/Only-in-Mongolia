<?php

namespace App\Payments;

use App\Models\Payment;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * QPay merchant API v2: POST /auth/token (basic auth) gives a bearer token; POST /invoice gives a QR code and
 * bank app links; POST /payment/check lists the paid rows for an invoice.
 */
class QPayGateway implements PaymentGateway
{
    public function __construct(
        private readonly string $username,
        private readonly string $password,
        private readonly string $invoiceCode,
        private readonly string $baseUrl,
    ) {}

    public function name(): string
    {
        return 'qpay';
    }

    public function createInvoice(Payment $payment, string $description, string $callbackUrl): array
    {
        $json = $this->call(fn (PendingRequest $http) => $http->post("{$this->baseUrl}/invoice", [
            'invoice_code' => $this->invoiceCode,
            'sender_invoice_no' => $payment->id,
            'invoice_receiver_code' => (string) $payment->user_id,
            'invoice_description' => mb_substr($description, 0, 255),
            'amount' => $payment->amount,
            'callback_url' => $callbackUrl,
        ]));

        if (empty($json['invoice_id'])) {
            throw new PaymentException('QPay did not return an invoice.');
        }

        return [
            'invoice_id' => (string) $json['invoice_id'],
            'qr_text' => $json['qr_text'] ?? null,
            'qr_image' => $json['qr_image'] ?? null,
            'bank_links' => collect($json['urls'] ?? [])->map(fn ($u) => [
                'name' => (string) ($u['name'] ?? ''),
                'description' => (string) ($u['description'] ?? ''),
                'logo' => (string) ($u['logo'] ?? ''),
                'link' => (string) ($u['link'] ?? ''),
            ])->filter(fn ($u) => $u['link'] !== '')->values()->all(),
        ];
    }

    public function isPaid(Payment $payment): bool
    {
        $json = $this->call(fn (PendingRequest $http) => $http->post("{$this->baseUrl}/payment/check", [
            'object_type' => 'INVOICE',
            'object_id' => $payment->invoice_id,
            'offset' => ['page_number' => 1, 'page_limit' => 100],
        ]));

        $paid = collect($json['rows'] ?? [])->where('payment_status', 'PAID')->sum(fn ($r) => (float) ($r['payment_amount'] ?? 0));

        return $paid >= $payment->amount;
    }

    private function token(): string
    {
        return Cache::remember('qpay.token', now()->addMinutes(50), function () {
            try {
                $res = Http::withBasicAuth($this->username, $this->password)->acceptJson()->timeout(10)->post("{$this->baseUrl}/auth/token");
            } catch (ConnectionException $e) {
                throw new PaymentException('Could not reach QPay.', previous: $e);
            }
            if (! $res->successful() || ! $res->json('access_token')) {
                Log::warning('QPay auth failed', ['status' => $res->status()]);
                throw new PaymentException('QPay login failed.');
            }

            return (string) $res->json('access_token');
        });
    }

    /** @param  callable(PendingRequest): Response  $request */
    private function call(callable $request): array
    {
        try {
            $res = $request(Http::withToken($this->token())->acceptJson()->asJson()->timeout(15));
            if ($res->status() === 401) { // token expired early: refresh once
                Cache::forget('qpay.token');
                $res = $request(Http::withToken($this->token())->acceptJson()->asJson()->timeout(15));
            }
        } catch (ConnectionException $e) {
            throw new PaymentException('Could not reach QPay.', previous: $e);
        }
        if (! $res->successful()) {
            Log::warning('QPay request failed', ['status' => $res->status(), 'body' => mb_substr($res->body(), 0, 500)]);
            throw new PaymentException('QPay request failed.');
        }

        return $res->json() ?? [];
    }
}
