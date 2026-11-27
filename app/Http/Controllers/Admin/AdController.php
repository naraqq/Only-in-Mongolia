<?php

namespace App\Http\Controllers\Admin;

use App\Ads\BannerMedia;
use App\Billing\Receipts;
use App\Http\Controllers\BusinessController;
use App\Http\Controllers\Controller;
use App\Media\Ffmpeg;
use App\Models\Ad;
use App\Models\Payment;
use App\Models\Receipt;
use App\Notifications\Activity;
use App\Payments\Payments;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin → Sponsored: other companies' banners, when they run, and how they did (the advertiser's report).
 * Campaigns companies bought themselves wait here for review: approve (it runs) or reject (it's refunded).
 */
class AdController extends Controller
{
    public function index(Request $request): Response
    {
        $days = in_array((int) $request->query('days'), [7, 30, 90], true) ? (int) $request->query('days') : 30;
        $since = now()->subDays($days - 1)->toDateString();
        $period = DB::table('ad_stats')->where('day', '>=', $since)->groupBy('ad_id')
            ->selectRaw('ad_id, sum(impressions) as impressions, sum(clicks) as clicks')->get()->keyBy('ad_id');
        $total = DB::table('ad_stats')->groupBy('ad_id')->selectRaw('ad_id, sum(impressions) as impressions, sum(clicks) as clicks')->get()->keyBy('ad_id');

        return Inertia::render('admin/ads', [
            'days' => $days,
            // Paid campaigns waiting for a decision, oldest first.
            'review' => Ad::with('company.user:id,name,phone')->where('review_status', Ad::PENDING)->oldest('submitted_at')->get()
                ->map(fn (Ad $ad) => [
                    ...BusinessController::campaignCard($ad),
                    'company' => $ad->company ? [
                        ...$ad->company->only('name', 'register_number', 'email', 'website'),
                        'logo' => $ad->company->logoUrl(),
                        'contact' => $ad->company->user?->name,
                        'phone' => $ad->company->user?->phone,
                    ] : null,
                ]),
            // Everything else, except campaigns companies haven't paid for.
            'ads' => Ad::with('company:id,name')->whereNotIn('review_status', [Ad::UNPAID, Ad::PENDING])->latest('id')->get()->map(fn (Ad $ad) => [
                ...$ad->only('id', 'advertiser', 'title', 'body', 'url', 'active', 'weight', 'allow_adult', 'placement', 'frequency_cap', 'price', 'reject_reason'),
                'starts_on' => $ad->starts_on->toDateString(),
                'ends_on' => $ad->ends_on?->toDateString(),
                'image' => $ad->imageUrl(),
                'video' => $ad->videoUrl(),
                'poster' => $ad->posterUrl(),
                'company' => $ad->company?->name,
                'receipt' => $ad->company_id ? BusinessController::receiptFor($ad) : null,
                'status' => $ad->status(),
                'impressions' => (int) ($period[$ad->id]->impressions ?? 0),
                'clicks' => (int) ($period[$ad->id]->clicks ?? 0),
                'total_impressions' => (int) ($total[$ad->id]->impressions ?? 0),
                'total_clicks' => (int) ($total[$ad->id]->clicks ?? 0),
            ]),
            'contact' => config('services.ads.contact'),
            'videoMaxSeconds' => (int) config('ads.video_max_seconds'),
            'videoMaxMb' => (int) config('ads.video_max_mb'),
        ]);
    }

    public function store(Request $request, Ffmpeg $ffmpeg): RedirectResponse
    {
        $data = $this->validated($request, true);
        $ad = Ad::create([...$data, ...BannerMedia::store($request->file('media'), $ffmpeg), 'created_by' => $request->user()->id]);
        BannerMedia::process($ad);

        return back()->with('status', 'ad-saved');
    }

    /** Change the details; a new picture or video replaces the old one (either kind for either). */
    public function update(Request $request, Ad $ad, Ffmpeg $ffmpeg): RedirectResponse
    {
        $data = $this->validated($request, false);
        if ($request->hasFile('media')) {
            $old = (clone $ad);
            $ad->update([...$data, ...BannerMedia::store($request->file('media'), $ffmpeg)]);
            $old->deleteFiles();
            BannerMedia::process($ad);
        } else {
            $ad->update($data);
        }

        return back()->with('status', 'ad-saved');
    }

    /** Pause or resume. */
    public function toggle(Ad $ad): RedirectResponse
    {
        $ad->update(['active' => ! $ad->active]);

        return back();
    }

    /**
     * Let a company's paid campaign run. If review took past its first day, the dates move along so the company
     * still gets every day it paid for.
     */
    public function approve(Request $request, Ad $ad): RedirectResponse
    {
        $updated = DB::transaction(function () use ($request, $ad) {
            $fresh = Ad::whereKey($ad->id)->lockForUpdate()->first();
            if ($fresh->review_status !== Ad::PENDING) {
                return null;
            }
            $late = (int) $fresh->starts_on->diffInDays(Carbon::today(), false);
            $fresh->update([
                'review_status' => Ad::APPROVED,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'reject_reason' => null,
                ...($late > 0 ? ['starts_on' => Carbon::today(), 'ends_on' => $fresh->ends_on?->copy()->addDays($late)] : []),
            ]);

            return $fresh;
        });
        abort_unless($updated, 409, 'This campaign was already reviewed.');
        $updated->company?->user?->notify(new Activity('ad_approved', $request->user()->id, ['note' => $updated->title, 'date' => $updated->starts_on->toDateString()]));

        return back()->with('status', 'ad-approved');
    }

    /** Turn down a company's paid campaign, with the reason they'll see. The payment is refunded. */
    public function reject(Request $request, Ad $ad, Payments $payments): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:300']]);
        abort_unless($ad->review_status === Ad::PENDING, 409, 'This campaign was already reviewed.');
        $payment = Payment::where('ad_id', $ad->id)->where('purpose', Payment::AD)->where('status', Payment::PAID)->latest('paid_at')->first();
        if ($payment) {
            // Wallet payments go straight back to the wallet; QPay ones are returned from the QPay merchant panel.
            $payments->refund($payment, $request->user(), $data['reason']);
        } else {
            $ad->update(['review_status' => Ad::REJECTED, 'reject_reason' => $data['reason'], 'reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);
        }
        $ad->company?->user?->notify(new Activity('ad_rejected', $request->user()->id, [
            'note' => $ad->title, 'reason' => $data['reason'], 'amount' => $payment?->amount, 'wallet' => $payment?->provider === Payments::WALLET,
        ]));

        return back()->with('status', 'ad-rejected');
    }

    public function destroy(Ad $ad): RedirectResponse
    {
        $ad->deleteFiles();
        $ad->delete();

        return back();
    }

    /** Any company's receipt, as a PDF. */
    public function receipt(Receipt $receipt): \Symfony\Component\HttpFoundation\Response
    {
        return Receipts::pdf($receipt);
    }

    /** One banner's day-by-day numbers, as a CSV to send the advertiser. */
    public function report(Ad $ad)
    {
        return $ad->report();
    }

    private function validated(Request $request, bool $creating): array
    {
        $data = $request->validate([
            'advertiser' => ['required', 'string', 'max:80'],
            'title' => ['required', 'string', 'max:90'],
            'body' => ['nullable', 'string', 'max:160'],
            'url' => ['required', 'url:https,http', 'max:500'],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'weight' => ['required', 'integer', 'min:1', 'max:10'],
            'allow_adult' => ['boolean'],
            'placement' => ['sometimes', Rule::in(Ad::PLACEMENTS)],
            'frequency_cap' => ['nullable', 'integer', Rule::in(Ad::FREQUENCY_CAPS)],
            'active' => ['boolean'],
            'media' => BannerMedia::rule($creating),
        ]);
        unset($data['media']);

        return $data;
    }
}
