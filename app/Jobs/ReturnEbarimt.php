<?php

namespace App\Jobs;

use App\Billing\Ebarimt;
use App\Models\Receipt;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/** Return a refunded payment's receipt at e-barimt (App\Billing\Ebarimt::return). */
class ReturnEbarimt implements ShouldQueue
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
        if (! $receipt || $receipt->ebarimt_status === Receipt::EB_RETURNED || $receipt->ebarimt_status === Receipt::EB_NONE) {
            return;
        }
        if ($receipt->ebarimt_status === Receipt::EB_ISSUED && ! Ebarimt::enabled()) {
            return; // switched off since: needs doing by hand
        }
        try {
            Ebarimt::return($receipt);
        } catch (Throwable $e) {
            $receipt->update(['ebarimt_error' => mb_substr('Return: '.$e->getMessage(), 0, 500)]);
            throw $e;
        }
    }
}
