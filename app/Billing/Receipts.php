<?php

namespace App\Billing;

use App\Jobs\IssueEbarimt;
use App\Jobs\ReturnEbarimt;
use App\Models\Ad;
use App\Models\Payment;
use App\Models\Receipt;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Receipts for what companies pay (sponsored campaigns). Issued once, the moment a payment is paid, with numbers
 * counting up within the year (OIM-2026-000001) and the buyer and amounts copied in, so a receipt never changes.
 * Prices include VAT (config billing.vat_percent). With e-barimt on, each receipt is also registered with the tax
 * office in the background (App\Jobs\IssueEbarimt) and returned there if the payment is refunded.
 */
class Receipts
{
    /** The receipt for a paid company payment (made now if it doesn't exist yet). Call inside the paying transaction. */
    public static function issue(Payment $payment): ?Receipt
    {
        if ($payment->purpose !== Payment::AD || ! $payment->isPaid()) {
            return null;
        }
        if ($existing = Receipt::where('payment_id', $payment->id)->first()) {
            return $existing;
        }
        $ad = Ad::with('company')->find($payment->ad_id);
        $company = $ad?->company;
        $percent = (int) config('billing.vat_percent');
        $days = $ad?->ends_on ? Ad::days($ad->starts_on, $ad->ends_on) : 1;
        $year = (int) ($payment->paid_at ?? now())->format('Y');
        $ebarimt = Ebarimt::enabled();

        for ($attempt = 0; ; $attempt++) {
            try {
                $receipt = DB::transaction(function () use ($payment, $ad, $company, $percent, $days, $year, $ebarimt) {
                    $sequence = (int) Receipt::where('year', $year)->lockForUpdate()->max('sequence') + 1;

                    return Receipt::create([
                        'payment_id' => $payment->id,
                        'company_id' => $company?->id,
                        'number' => sprintf('%s-%d-%06d', config('billing.number_prefix'), $year, $sequence),
                        'year' => $year,
                        'sequence' => $sequence,
                        'buyer_name' => $company?->name ?? $payment->user?->name ?? '—',
                        'buyer_register' => $company?->register_number,
                        'buyer_email' => $company?->email,
                        'description' => $ad
                            ? sprintf('Сурталчилгааны баннер: “%s” (%s – %s)', $ad->title, $ad->starts_on->format('Y.m.d'), $ad->ends_on?->format('Y.m.d'))
                            : 'Сурталчилгааны баннер',
                        'quantity' => $days,
                        'total' => $payment->amount,
                        'vat' => self::vatIn($payment->amount, $percent),
                        'vat_percent' => $percent,
                        'issued_at' => $payment->paid_at ?? now(),
                        'ebarimt_status' => $ebarimt ? Receipt::EB_PENDING : Receipt::EB_NONE,
                    ]);
                });
                break;
            } catch (UniqueConstraintViolationException $e) {
                // Another receipt took the same number at the same moment (or this payment got one): try again.
                if ($existing = Receipt::where('payment_id', $payment->id)->first()) {
                    return $existing;
                }
                if ($attempt >= 4) {
                    throw $e;
                }
            }
        }
        if ($ebarimt) {
            IssueEbarimt::dispatch($receipt->id)->afterCommit();
        }

        return $receipt;
    }

    /** A refunded payment's receipt: returned at e-barimt (if registered there). The PDF then says "refunded". */
    public static function refunded(Payment $payment): void
    {
        $receipt = Receipt::where('payment_id', $payment->id)->first();
        if ($receipt && in_array($receipt->ebarimt_status, [Receipt::EB_ISSUED, Receipt::EB_PENDING, Receipt::EB_FAILED], true)) {
            ReturnEbarimt::dispatch($receipt->id)->afterCommit();
        }
    }

    /** The VAT inside a VAT-included amount, rounded to the tögrög: 110 → 10 at 10%. */
    public static function vatIn(int $total, int $percent): int
    {
        return $percent > 0 ? (int) round($total * $percent / (100 + $percent)) : 0;
    }

    /** The receipt as a PDF to download. */
    public static function pdf(Receipt $receipt): Response
    {
        $receipt->loadMissing('payment');

        return Pdf::loadView('billing.receipt', [
            'r' => $receipt,
            'seller' => config('billing.seller'),
            'refunded' => $receipt->payment?->status === Payment::REFUNDED,
            'qr' => $receipt->ebarimt_qr ? self::qrSvg($receipt->ebarimt_qr) : null,
        ])->setPaper('a4')->setOption('isFontSubsettingEnabled', true)->download($receipt->number.'.pdf');
    }

    /** The e-barimt QR as an inline SVG data URI (the PDF can't fetch images). */
    private static function qrSvg(string $data): ?string
    {
        if (! class_exists(Writer::class)) {
            return null;
        }
        $writer = new Writer(new ImageRenderer(
            new RendererStyle(180, 0),
            new SvgImageBackEnd,
        ));

        return 'data:image/svg+xml;base64,'.base64_encode($writer->writeString($data));
    }
}
