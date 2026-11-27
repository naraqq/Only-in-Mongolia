<?php

namespace App\Jobs;

use App\Billing\Ebarimt;
use App\Models\Receipt;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Register one receipt with e-barimt (App\Billing\Ebarimt). PosAPI runs on our side and can be briefly down, so it
 * tries a few times over about an hour; after that the receipt shows as failed in admin, and
 * php artisan billing:ebarimt --retry sends it again.
 */
class IssueEbarimt implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public function __construct(public int $receiptId) {}

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300, 900, 1800];
    }

    public function handle(): void
    {
        $receipt = Receipt::find($this->receiptId);
        if (! $receipt || ! in_array($receipt->ebarimt_status, [Receipt::EB_PENDING, Receipt::EB_FAILED], true) || ! Ebarimt::enabled()) {
            return;
        }
        try {
            Ebarimt::issue($receipt);
        } catch (Throwable $e) {
            $receipt->update(['ebarimt_status' => Receipt::EB_FAILED, 'ebarimt_error' => mb_substr($e->getMessage(), 0, 500)]);
            throw $e; // tried again later
        }
    }
}
