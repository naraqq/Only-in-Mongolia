<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use App\Models\Subscription;
use App\Models\WalletEntry;
use App\Payments\InsufficientBalance;
use App\Payments\Payments;
use App\Payments\Wallet;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * A fan's wallet: the balance and every change to it (top-ups, spending, refunds), what they've spent,
 * the subscriptions they're paying for (and when each runs out), and every purchase with its receipt.
 */
class WalletController extends Controller
{
    /** One tap: pay one more month from the wallet and stay where you are. */
    public function renew(Request $request, string $handle, Payments $payments): RedirectResponse
    {
        $sub = $this->mine($request, $handle);
        try {
            $payments->startSubscription($request->user(), $sub->creator, 1, fromWallet: true);
        } catch (InsufficientBalance) {
            return back()->withErrors(['payment' => __('Your wallet doesn’t have enough. Top it up or pay with QPay.')]);
        }

        return back()->with('status', 'renewed');
    }

    /** Turn renewing from the wallet on or off for one subscription. */
    public function autoRenew(Request $request, string $handle): RedirectResponse
    {
        $on = $request->validate(['on' => ['required', 'boolean']])['on'];
        $this->mine($request, $handle)->update(['auto_renew' => $on]);

        return back()->with('status', $on ? 'auto-renew-on' : 'auto-renew-off');
    }

    /** The signed-in fan's subscription to @handle (active or not). */
    private function mine(Request $request, string $handle): Subscription
    {
        return $request->user()->subscriptions()->with('creator')
            ->whereHas('creator', fn ($q) => $q->where('handle', mb_strtolower($handle))->where('status', \App\Models\CreatorProfile::APPROVED))
            ->firstOrFail();
    }

    public function index(Request $request): Response
    {
        $me = $request->user();
        $balance = Wallet::balance($me);
        // Purchases from creators, however they were paid. Top-ups are wallet activity, not spending.
        $sales = fn () => $me->payments()->whereIn('purpose', Payment::SALES);
        $paid = fn () => $sales()->where('status', Payment::PAID);
        $creator = fn ($c) => $c ? ['handle' => $c->handle, 'display_name' => $c->display_name, 'avatar_url' => $c->avatarUrl()] : null;

        return Inertia::render('wallet', [
            'balance' => $balance,
            'limits' => [
                'min' => (int) config('creators.min_topup'),
                'max' => (int) min(config('creators.max_topup'), max(0, config('creators.max_wallet') - $balance)),
            ],
            'summary' => [
                'spentMonth' => (int) $paid()->where('paid_at', '>=', now()->startOfMonth())->sum('amount'),
                'spentAll' => (int) $paid()->sum('amount'),
                'refunded' => (int) $sales()->where('status', Payment::REFUNDED)->sum('amount'),
                'count' => $paid()->count(),
            ],
            'entries' => $me->walletEntries()->with('payment.creator.user:id,avatar_path')->latest('id')->take(50)->get()
                ->map(fn (WalletEntry $e) => [
                    'id' => $e->id,
                    'type' => $e->type,
                    'amount' => $e->amount,
                    'balance_after' => $e->balance_after,
                    'created_at' => $e->created_at->toIso8601String(),
                    'payment_id' => $e->payment_id,
                    'purpose' => $e->payment?->purpose,
                    'creator' => $creator($e->payment?->creator),
                ]),
            'subscriptions' => $me->subscriptions()->active()->with('creator.user:id,avatar_path')->orderBy('expires_at')->get()
                ->map(fn ($s) => [
                    ...$creator($s->creator),
                    'price_monthly' => $s->creator->price_monthly,
                    'expires_at' => $s->expires_at->toIso8601String(),
                    'auto_renew' => $s->auto_renew,
                ]),
            'payments' => $sales()->whereIn('status', [Payment::PAID, Payment::REFUNDED])->with('creator.user:id,avatar_path')
                ->latest('paid_at')->take(100)->get()
                ->map(fn (Payment $p) => [
                    'id' => $p->id,
                    'purpose' => $p->purpose,
                    'amount' => $p->amount,
                    'months' => $p->months,
                    'status' => $p->status,
                    'wallet' => $p->provider === Payments::WALLET,
                    'paid_at' => $p->paid_at?->toIso8601String(),
                    'refunded_at' => $p->refunded_at?->toIso8601String(),
                    'creator' => $creator($p->creator),
                ]),
        ]);
    }
}
