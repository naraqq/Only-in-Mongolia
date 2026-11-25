<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\Payment;
use App\Models\Post;
use App\Models\PostComment;
use App\Models\Report;
use App\Models\User;
use App\Payments\Earnings;
use App\Payments\Payments;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/** Admins: find any account, see what they paid, earned and were reported for; ban, make admin, refund. */
class UserController extends Controller
{
    public function index(Request $request): Response
    {
        $q = trim((string) $request->query('q', ''));
        $filter = in_array($request->query('filter'), ['creators', 'admins', 'banned'], true) ? $request->query('filter') : 'all';
        $like = '%'.str_replace(['%', '_'], ['\%', '\_'], ltrim($q, '@')).'%';

        $users = User::query()->with('creatorProfile:id,user_id,handle,display_name,status')
            ->withSum(['payments as spent' => fn ($p) => $p->where('status', Payment::PAID)], 'amount')
            ->when($q !== '', fn ($w) => $w->where(fn ($s) => $s->where('name', 'like', $like)->orWhere('phone', 'like', $like)
                ->when(ctype_digit($q), fn ($d) => $d->orWhere('id', (int) $q))
                ->orWhereHas('creatorProfile', fn ($c) => $c->where('handle', 'like', $like)->orWhere('display_name', 'like', $like))))
            ->when($filter === 'creators', fn ($w) => $w->whereHas('creatorProfile'))
            ->when($filter === 'admins', fn ($w) => $w->where('is_admin', true))
            ->when($filter === 'banned', fn ($w) => $w->whereNotNull('banned_at'))
            ->latest('id')->paginate(30)->withQueryString()
            ->through(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'phone' => $u->phone,
                'avatar_url' => $u->avatar_url,
                'is_admin' => (bool) $u->is_admin,
                'banned' => $u->banned_at !== null,
                'creator' => $u->creatorProfile?->only(['handle', 'display_name', 'status']),
                'spent' => (int) $u->spent,
                'joined' => $u->created_at->toIso8601String(),
            ]);

        return Inertia::render('admin/users', ['users' => $users, 'q' => $q, 'filter' => $filter]);
    }

    public function show(Request $request, User $user): Response
    {
        $creator = $user->creatorProfile;
        $payment = fn (Payment $p) => [
            'id' => $p->id,
            'purpose' => $p->purpose,
            'amount' => $p->amount,
            'status' => $p->status,
            'fan' => ['id' => $p->user_id, 'name' => $p->user?->name],
            'creator' => $p->creator?->only(['handle', 'display_name']),
            'at' => ($p->paid_at ?? $p->created_at)->toIso8601String(),
            'refund_reason' => $p->refund_reason,
        ];

        // Reports about anything this person made: their creator page, posts, comments and messages.
        $reportsAgainst = Report::with('reporter:id,name')->where(function ($q) use ($user, $creator) {
            $q->where(fn ($w) => $w->where('reportable_type', PostComment::class)->whereIn('reportable_id', PostComment::where('user_id', $user->id)->select('id')))
                ->orWhere(fn ($w) => $w->where('reportable_type', Message::class)->whereIn('reportable_id', Message::where('sender_id', $user->id)->select('id')));
            if ($creator) {
                $q->orWhere(fn ($w) => $w->where('reportable_type', CreatorProfile::class)->where('reportable_id', $creator->id))
                    ->orWhere(fn ($w) => $w->where('reportable_type', Post::class)->whereIn('reportable_id', Post::where('creator_profile_id', $creator->id)->select('id')));
            }
        })->latest()->take(50)->get();
        $report = fn (Report $r) => [
            'id' => $r->id,
            'reason' => $r->reason,
            'type' => array_search($r->reportable_type, Report::TYPES, true) ?: 'url',
            'details' => $r->details,
            'status' => $r->status,
            'reporter' => $r->reporter?->name ?? $r->contact_name,
            'at' => $r->created_at->toIso8601String(),
        ];

        $earnings = $creator ? new Earnings($creator) : null;
        $shown = [Payment::PAID, Payment::REFUNDED];

        return Inertia::render('admin/user', [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'phone' => $user->phone,
                'birthdate' => $user->birthdate?->toDateString(),
                'avatar_url' => $user->avatar_url,
                'is_admin' => (bool) $user->is_admin,
                'banned_at' => $user->banned_at?->toIso8601String(),
                'ban_reason' => $user->ban_reason,
                'joined' => $user->created_at->toIso8601String(),
                'is_me' => $user->id === $request->user()->id,
                'subscriptions' => $user->subscriptions()->active()->count(),
                'following' => $user->following()->count(),
            ],
            'creator' => $creator ? [
                'id' => $creator->id,
                'handle' => $creator->handle,
                'display_name' => $creator->display_name,
                'status' => $creator->status,
                'price' => $creator->price_monthly,
                'subscribers' => $creator->subscriptions()->active()->count(),
                'posts' => $creator->posts()->count(),
                'earned' => $earnings->earned(),
                'available' => $earnings->available(),
                'paid_out' => $earnings->paidOut(),
            ] : null,
            'spent' => (int) $user->payments()->where('status', Payment::PAID)->sum('amount'),
            'paymentsMade' => $user->payments()->with('creator:id,handle,display_name')->whereIn('status', $shown)
                ->latest('paid_at')->take(50)->get()->map($payment),
            'paymentsReceived' => $creator ? $creator->payments()->with('user:id,name')->whereIn('status', $shown)
                ->latest('paid_at')->take(50)->get()->map($payment) : [],
            'reportsAgainst' => $reportsAgainst->map($report),
            'reportsFiled' => Report::where('reporter_id', $user->id)->latest()->take(20)->get()->map($report),
        ]);
    }

    /** Block the account: they're signed out everywhere and their creator page is suspended. Admins can't be banned. */
    public function ban(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:300']]);
        abort_if($user->is_admin || $user->id === $request->user()->id, 422, 'Remove admin rights first.');

        DB::transaction(function () use ($user, $data) {
            $user->forceFill(['banned_at' => now(), 'ban_reason' => $data['reason'], 'remember_token' => null])->save();
            $user->creatorProfile()->where('status', CreatorProfile::APPROVED)->update(['status' => CreatorProfile::SUSPENDED]);
            if (config('session.driver') === 'database') {
                DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
            }
        });

        return back()->with('status', 'banned');
    }

    /** Lift a ban. A suspended creator page stays suspended until it's reinstated separately. */
    public function unban(User $user): RedirectResponse
    {
        $user->forceFill(['banned_at' => null, 'ban_reason' => null])->save();

        return back()->with('status', 'unbanned');
    }

    public function toggleAdmin(Request $request, User $user): RedirectResponse
    {
        abort_if($user->id === $request->user()->id, 422, 'You cannot change your own admin rights.');
        abort_if(! $user->is_admin && $user->banned_at, 422, 'Unban first.');
        $user->forceFill(['is_admin' => ! $user->is_admin])->save();

        return back();
    }

    public function refund(Request $request, Payment $payment, Payments $payments): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:300']]);
        $payments->refund($payment, $request->user(), $data['reason']);

        return back()->with('status', 'refunded');
    }
}
