<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Payout;
use App\Models\Report;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/** Admin home: the business at a glance and what's waiting for an admin. */
class DashboardController extends Controller
{
    private const DAYS = 30;

    public function index(): Response
    {
        $monthStart = now()->startOfMonth();
        // Sales to creators; wallet top-ups aren't sales (the money is counted when it's spent).
        $paid = fn () => Payment::where('status', Payment::PAID)->whereIn('purpose', Payment::SALES);
        $since = now()->subDays(self::DAYS - 1)->startOfDay();

        return Inertia::render('admin/dashboard', [
            'kpis' => [
                'users' => User::count(),
                'usersNew7d' => User::where('created_at', '>=', now()->subDays(7))->count(),
                'creators' => CreatorProfile::where('status', CreatorProfile::APPROVED)->count(),
                'subscriptions' => Subscription::active()->count(),
                'gmvMonth' => (int) $paid()->where('paid_at', '>=', $monthStart)->sum('amount'),
                'feeMonth' => (int) $paid()->where('paid_at', '>=', $monthStart)->sum('platform_fee'),
                'gmvAll' => (int) $paid()->sum('amount'),
                // What fans hold in their wallets: money the platform owes them until they spend it.
                'walletHeld' => (int) User::sum('wallet_balance'),
            ],
            'todo' => [
                'applications' => CreatorProfile::where('status', CreatorProfile::PENDING)->count(),
                'payouts' => Payout::where('status', Payout::REQUESTED)->count(),
                'payoutsAmount' => (int) Payout::where('status', Payout::REQUESTED)->sum('amount'),
                'reports' => Report::where('status', 'open')->count(),
                'urgentReports' => Report::where('status', 'open')->whereIn('reason', Report::URGENT)->count(),
            ],
            'byPurpose' => $paid()->where('paid_at', '>=', $monthStart)->groupBy('purpose')
                ->selectRaw('purpose, sum(amount) as total, count(*) as n')->get()
                ->mapWithKeys(fn ($r) => [$r->purpose => ['total' => (int) $r->total, 'count' => (int) $r->n]]),
            'revenue' => $this->daily($paid()->where('paid_at', '>=', $since)->selectRaw('date(paid_at) as d, sum(amount) as v')->groupBy('d')->pluck('v', 'd'), $since),
            'signups' => $this->daily(User::where('created_at', '>=', $since)->selectRaw('date(created_at) as d, count(*) as v')->groupBy('d')->pluck('v', 'd'), $since),
            'topCreators' => $paid()->where('paid_at', '>=', $monthStart)->groupBy('creator_profile_id')
                ->selectRaw('creator_profile_id, sum(amount) as total, count(*) as n')->orderByDesc('total')->take(5)->get()
                ->map(function ($r) {
                    $c = CreatorProfile::with('user:id,avatar_path')->find($r->creator_profile_id);

                    return $c ? ['handle' => $c->handle, 'display_name' => $c->display_name, 'avatar_url' => $c->avatarUrl(), 'total' => (int) $r->total, 'count' => (int) $r->n] : null;
                })->filter()->values(),
            'recentPayments' => $paid()->with(['user:id,name', 'creator:id,handle'])->latest('paid_at')->take(10)->get()
                ->map(fn (Payment $p) => [
                    'id' => $p->id,
                    'purpose' => $p->purpose,
                    'amount' => $p->amount,
                    'fan' => $p->user?->name,
                    'creator' => $p->creator?->handle,
                    'paid_at' => $p->paid_at->toIso8601String(),
                ]),
        ]);
    }

    /** One value per day for the last DAYS days, zero-filled. */
    private function daily($byDate, Carbon $since): array
    {
        return collect(range(0, self::DAYS - 1))->map(function ($i) use ($byDate, $since) {
            $d = $since->copy()->addDays($i)->toDateString();

            return ['date' => $d, 'value' => (int) ($byDate[$d] ?? 0)];
        })->all();
    }
}
