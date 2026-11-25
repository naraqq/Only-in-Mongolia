<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Payout;
use App\Notifications\Activity;
use App\Payments\Earnings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/** Admins: the queue of payout requests. Send the bank transfer, then mark it paid with the reference (or reject). */
class PayoutController extends Controller
{
    public function index(): Response
    {
        $map = fn (Payout $p) => [
            'id' => $p->id,
            'amount' => $p->amount,
            'status' => $p->status,
            'creator' => ['handle' => $p->creator->handle, 'display_name' => $p->creator->display_name],
            'bank' => ['name' => $p->bank_name, 'account' => $p->bank_account, 'holder' => $p->account_holder], // admins see the full number
            'reference' => $p->reference,
            'available' => $p->status === Payout::REQUESTED ? (new Earnings($p->creator))->available() + $p->amount : null,
            'requested_at' => $p->created_at->toIso8601String(),
            'processed_at' => $p->processed_at?->toIso8601String(),
        ];

        return Inertia::render('admin/payouts', [
            'open' => Payout::with('creator')->where('status', Payout::REQUESTED)->oldest()->get()->map($map),
            'done' => Payout::with('creator')->where('status', '!=', Payout::REQUESTED)->latest('processed_at')->take(30)->get()->map($map),
        ]);
    }

    public function decide(Request $request, Payout $payout): RedirectResponse
    {
        $data = $request->validate([
            'decision' => ['required', 'in:paid,rejected'],
            'reference' => ['required', 'string', 'max:120'], // transfer reference, or the reason for rejecting
        ]);

        DB::transaction(function () use ($payout, $data, $request) {
            $fresh = Payout::whereKey($payout->id)->lockForUpdate()->first();
            abort_unless($fresh->status === Payout::REQUESTED, 409, 'Already processed.');
            $fresh->update([
                'status' => $data['decision'],
                'reference' => $data['reference'],
                'processed_at' => now(),
                'processed_by' => $request->user()->id,
            ]);
            $fresh->creator->user->notify(new Activity('payout_'.$data['decision'], $request->user()->id, [
                'amount' => $fresh->amount,
                'note' => $data['reference'],
            ]));
        });

        return back();
    }
}
