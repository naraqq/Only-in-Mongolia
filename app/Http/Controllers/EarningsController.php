<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Payout;
use App\Payments\Earnings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Studio → Earnings: balance, payout requests and history, and a CSV statement. */
class EarningsController extends Controller
{
    private function creator(Request $request): CreatorProfile
    {
        $creator = $request->user()->creatorProfile()->first();
        abort_unless($creator?->isApproved(), 403);

        return $creator;
    }

    public function index(Request $request): Response
    {
        $creator = $this->creator($request);
        $e = new Earnings($creator);

        return Inertia::render('studio/earnings', [
            'balance' => [
                'available' => $e->available(),
                'onHold' => $e->onHold(),
                'nextRelease' => $e->nextRelease()?->toIso8601String(),
                'requested' => $e->requested(),
                'paidOut' => $e->paidOut(),
                'earned' => $e->earned(),
            ],
            'rules' => [
                'minPayout' => (int) config('creators.min_payout'),
                'holdDays' => Earnings::holdDays(),
                'feePercent' => (int) config('creators.platform_fee_percent'),
            ],
            'bank' => ['name' => $creator->bank_name, 'account' => self::mask((string) $creator->bank_account), 'holder' => $creator->account_holder],
            'payouts' => $creator->payouts()->latest()->take(50)->get()->map(fn (Payout $p) => [
                'id' => $p->id,
                'amount' => $p->amount,
                'status' => $p->status,
                'reference' => $p->reference,
                'requested_at' => $p->created_at->toIso8601String(),
                'processed_at' => $p->processed_at?->toIso8601String(),
            ]),
            'recent' => $creator->payments()->where('status', Payment::PAID)->with('user:id,name')->latest('paid_at')->take(30)->get()
                ->map(fn (Payment $p) => [
                    'id' => $p->id,
                    'purpose' => $p->purpose,
                    'fan' => $p->user?->name,
                    'amount' => $p->amount,
                    'net' => $p->amount - $p->platform_fee,
                    'paid_at' => $p->paid_at->toIso8601String(),
                ]),
        ]);
    }

    /** Ask to be paid (all or part of the available balance). One open request at a time. */
    public function requestPayout(Request $request): RedirectResponse
    {
        $creator = $this->creator($request);
        $data = $request->validate(['amount' => ['required', 'integer', 'min:'.config('creators.min_payout')]]);

        return DB::transaction(function () use ($creator, $data) {
            CreatorProfile::whereKey($creator->id)->lockForUpdate()->first(); // one request at a time per creator
            if ($creator->payouts()->where('status', Payout::REQUESTED)->exists()) {
                return back()->withErrors(['amount' => __('You already have a payout request in progress.')]);
            }
            if ($data['amount'] > (new Earnings($creator))->available()) {
                return back()->withErrors(['amount' => __('That is more than your available balance.')]);
            }
            $creator->payouts()->create([
                'amount' => $data['amount'],
                'status' => Payout::REQUESTED,
                'bank_name' => $creator->bank_name,
                'bank_account' => $creator->bank_account,
                'account_holder' => $creator->account_holder,
            ]);

            return back()->with('status', 'payout-requested');
        });
    }

    /** Every paid payment as a CSV (opens in Excel), for the creator's own records and taxes. */
    public function statement(Request $request): StreamedResponse
    {
        $creator = $this->creator($request);

        return response()->streamDownload(function () use ($creator) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows Mongolian text correctly
            fputcsv($out, ['Date', 'Type', 'Gross (MNT)', 'Platform fee (MNT)', 'Net (MNT)', 'Payment ID']);
            $creator->payments()->where('status', Payment::PAID)->orderBy('paid_at')->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $p) {
                    fputcsv($out, [$p->paid_at->format('Y-m-d H:i'), $p->purpose, $p->amount, $p->platform_fee, $p->amount - $p->platform_fee, $p->id]);
                }
            });
            fclose($out);
        }, 'earnings-'.$creator->handle.'-'.now()->format('Ymd').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** "5000123456" → "•••• 3456" */
    public static function mask(string $account): string
    {
        return strlen($account) > 4 ? '•••• '.substr($account, -4) : $account;
    }
}
