<?php

namespace App\Billing;

use App\Models\Receipt;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * e-barimt through PosAPI 3.0: the tax office's service, installed on (or next to) this server, that registers
 * receipts and hands back their number (ДДТД), QR data and lottery number. Companies get B2B receipts to their
 * TIN, found from their 7-digit register number.
 *
 * Switched on with EBARIMT_DRIVER=posapi and the values in config/billing.php. The request follows PosAPI 3.0's
 * receipt format; confirm the field values (district, classification code, payment codes) with your PosAPI
 * documentation and a test receipt before going live.
 */
class Ebarimt
{
    public static function enabled(): bool
    {
        return config('billing.ebarimt.driver') === 'posapi';
    }

    /** Register $receipt with e-barimt; saves the result on it. Throws when PosAPI refuses or can't be reached. */
    public static function issue(Receipt $receipt): Receipt
    {
        if ($receipt->ebarimt_status === Receipt::EB_ISSUED) {
            return $receipt;
        }
        $c = config('billing.ebarimt');
        $tin = self::tin((string) $receipt->buyer_register);
        $total = $receipt->total;
        $vat = $receipt->vat;
        $unit = round($total / max(1, $receipt->quantity), 2);
        $amount = fn (int|float $v) => round((float) $v, 2);

        $response = Http::timeout($c['timeout'])->acceptJson()->post(rtrim($c['url'], '/').'/rest/receipt', [
            'branchNo' => $c['branch_no'],
            'totalAmount' => $amount($total),
            'totalVAT' => $amount($vat),
            'totalCityTax' => 0,
            'districtCode' => $c['district_code'],
            'merchantTin' => $c['merchant_tin'],
            'posNo' => $c['pos_no'],
            'customerTin' => $tin,
            'consumerNo' => '',
            'type' => 'B2B_RECEIPT',
            'inactiveId' => '',
            'reportMonth' => null,
            'billIdSuffix' => substr($receipt->number, -6),
            'receipts' => [[
                'totalAmount' => $amount($total),
                'totalVAT' => $amount($vat),
                'totalCityTax' => 0,
                'taxType' => $receipt->vat_percent > 0 ? 'VAT_ABLE' : 'VAT_FREE',
                'merchantTin' => $c['merchant_tin'],
                'items' => [[
                    'name' => mb_substr($receipt->description, 0, 250),
                    'barCode' => null,
                    'barCodeType' => 'UNDEFINED',
                    'classificationCode' => $c['classification_code'],
                    'measureUnit' => 'хоног',
                    'qty' => $receipt->quantity,
                    'unitPrice' => $unit,
                    'totalAmount' => $amount($total),
                    'totalVAT' => $amount($vat),
                    'totalCityTax' => 0,
                ]],
            ]],
            'payments' => [[
                'code' => 'PAYMENT_CARD', // paid electronically (QPay or the app's wallet)
                'status' => 'PAID',
                'paidAmount' => $amount($total),
            ]],
        ]);

        $body = $response->json() ?? [];
        if (! $response->successful() || ($body['status'] ?? null) !== 'SUCCESS' || empty($body['id'])) {
            throw new RuntimeException('PosAPI refused the receipt: '.mb_substr((string) ($body['message'] ?? $response->body()), 0, 300));
        }
        $receipt->update([
            'ebarimt_status' => Receipt::EB_ISSUED,
            'ebarimt_id' => (string) $body['id'],
            'ebarimt_qr' => $body['qrData'] ?? null,
            'ebarimt_lottery' => $body['lottery'] ?? null,
            'ebarimt_date' => isset($body['date']) ? Carbon::parse($body['date']) : now(),
            'ebarimt_error' => null,
        ]);

        return $receipt;
    }

    /** Return (cancel) a registered receipt, after a refund. */
    public static function return(Receipt $receipt): Receipt
    {
        if ($receipt->ebarimt_status !== Receipt::EB_ISSUED) {
            // Never registered: nothing to undo there.
            $receipt->update(['ebarimt_status' => Receipt::EB_RETURNED]);

            return $receipt;
        }
        $c = config('billing.ebarimt');
        $response = Http::timeout($c['timeout'])->acceptJson()->delete(rtrim($c['url'], '/').'/rest/receipt', [
            'id' => $receipt->ebarimt_id,
            'date' => $receipt->ebarimt_date?->format('Y-m-d H:i:s'),
        ]);
        if (! $response->successful()) {
            throw new RuntimeException('PosAPI did not return the receipt: '.mb_substr($response->body(), 0, 300));
        }
        $receipt->update(['ebarimt_status' => Receipt::EB_RETURNED, 'ebarimt_error' => null]);

        return $receipt;
    }

    /** A company's TIN (ТТД) from its 7-digit register number. */
    public static function tin(string $register): string
    {
        if (! preg_match('/^\d{7}$/', $register)) {
            throw new RuntimeException('The company has no valid register number.');
        }
        $url = str_replace('{reg}', $register, (string) config('billing.ebarimt.tin_lookup_url'));
        $response = Http::timeout((int) config('billing.ebarimt.timeout'))->acceptJson()->get($url);
        $tin = $response->json('data');
        if (! $response->successful() || ! is_scalar($tin) || (string) $tin === '') {
            throw new RuntimeException("Couldn't find the TIN for register number {$register}.");
        }

        return (string) $tin;
    }
}
