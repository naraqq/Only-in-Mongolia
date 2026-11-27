<?php

namespace App\Console\Commands;

use App\Billing\Ebarimt;
use App\Billing\Receipts;
use App\Jobs\IssueEbarimt;
use App\Models\Payment;
use App\Models\Receipt;
use Illuminate\Console\Command;

/**
 * php artisan billing:ebarimt — receipts not (yet) registered with e-barimt, and why.
 * --retry sends the failed and waiting ones again; --backfill makes receipts for paid campaigns that have none
 * (paid before receipts existed).
 */
class BillingEbarimt extends Command
{
    protected $signature = 'billing:ebarimt {--retry : Send failed and waiting receipts to e-barimt again} {--backfill : Make receipts for paid campaigns that have none}';

    protected $description = 'Show, resend or backfill company receipts and their e-barimt registration';

    public function handle(): int
    {
        if ($this->option('backfill')) {
            $made = 0;
            Payment::where('purpose', Payment::AD)->whereIn('status', [Payment::PAID, Payment::REFUNDED])
                ->whereNotIn('id', Receipt::select('payment_id'))->orderBy('paid_at')
                ->each(function (Payment $p) use (&$made) {
                    // A refunded one still gets its receipt (marked refunded), so the numbers have no gaps.
                    $status = $p->status;
                    $p->status = Payment::PAID;
                    Receipts::issue($p);
                    $p->status = $status;
                    $made++;
                });
            $this->info("Made {$made} receipt(s).");
        }

        $open = Receipt::whereIn('ebarimt_status', [Receipt::EB_PENDING, Receipt::EB_FAILED])->orderBy('id')->get();
        if ($open->isEmpty()) {
            $this->info(Ebarimt::enabled() ? 'Every receipt is registered with e-barimt.' : 'e-barimt is off (EBARIMT_DRIVER=none): receipts are PDF only.');

            return self::SUCCESS;
        }
        $this->table(['Receipt', 'Company', 'Total', 'Status', 'Error'], $open->map(fn (Receipt $r) => [
            $r->number, $r->buyer_name, number_format($r->total).' ₮', $r->ebarimt_status, mb_strimwidth((string) $r->ebarimt_error, 0, 70, '…'),
        ]));
        if ($this->option('retry')) {
            if (! Ebarimt::enabled()) {
                $this->error('e-barimt is off. Set EBARIMT_DRIVER=posapi first.');

                return self::FAILURE;
            }
            $open->each(fn (Receipt $r) => IssueEbarimt::dispatch($r->id));
            $this->info("Queued {$open->count()} receipt(s).");
        }

        return self::SUCCESS;
    }
}
