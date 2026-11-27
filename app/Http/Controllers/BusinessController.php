<?php

namespace App\Http\Controllers;

use App\Billing\Receipts;
use App\Jobs\ProcessAdVideo;
use App\Media\Ffmpeg;
use App\Models\Ad;
use App\Models\Company;
use App\Models\Payment;
use App\Models\Receipt;
use App\Payments\InsufficientBalance;
use App\Payments\PaymentException;
use App\Payments\Payments;
use App\Payments\Wallet;
use App\Support\Images;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Companies advertising by themselves: anyone signed in can add a company (name, register number, contact), then
 * buy sponsored banners (a picture or a short video) for chosen days. A campaign is paid up front (QPay or wallet),
 * reviewed by an admin, and only then shown; a rejected one is refunded. The company sees how each one did.
 */
class BusinessController extends Controller
{
    /** Banners are stored at twice the 600×500 shown, so they stay sharp. */
    private const W = 1200;

    private const H = 1000;

    private const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

    public function __construct(private readonly Payments $payments) {}

    /** The company's campaigns, or the form to add the company first. */
    public function index(Request $request): Response|RedirectResponse
    {
        $company = $request->user()->company;
        if (! $company) {
            return to_route('business.company');
        }
        $ads = $company->ads()->latest('id')->get();
        $stats = Ad::totals($ads->pluck('id')->all());

        return Inertia::render('business/index', [
            'company' => $this->companyCard($company),
            'campaigns' => $ads->map(fn (Ad $ad) => [
                ...$this->campaignCard($ad),
                'impressions' => (int) ($stats[$ad->id]->impressions ?? 0),
                'clicks' => (int) ($stats[$ad->id]->clicks ?? 0),
            ]),
            'dailyPrice' => (int) config('ads.daily_price'),
        ]);
    }

    public function company(Request $request): Response
    {
        $company = $request->user()->company;

        return Inertia::render('business/company', [
            'dailyPrice' => (int) config('ads.daily_price'),
            'company' => $company ? [...$this->companyCard($company), ...$company->only('register_number', 'email', 'website')] : null,
        ]);
    }

    public function saveCompany(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'register_number' => ['required', 'string', 'regex:/^\d{7}$/'],
            'email' => ['required', 'email', 'max:255'],
            'website' => ['nullable', 'url:https,http', 'max:300'],
            'logo' => ['nullable', 'image', 'mimes:jpeg,png,webp', 'max:4096'],
        ], ['register_number.regex' => __('A company register number is 7 digits.')]);
        $company = $request->user()->company ?? new Company(['user_id' => $request->user()->id]);
        $company->fill(collect($data)->except('logo')->all());
        if ($request->hasFile('logo')) {
            $old = $company->logo_path;
            $company->logo_path = Images::storeCropped($request->file('logo'), 'companies', 400, 400);
            $old && Storage::disk('public')->delete($old);
        }
        $fresh = ! $company->exists;
        $company->save();

        return $fresh ? to_route('business.campaigns.new')->with('status', 'company-saved') : back()->with('status', 'company-saved');
    }

    public function create(Request $request): Response|RedirectResponse
    {
        $company = $request->user()->company;
        if (! $company) {
            return to_route('business.company');
        }

        return Inertia::render('business/new', [
            'company' => $this->companyCard($company),
            'dailyPrice' => (int) config('ads.daily_price'),
            'maxDays' => (int) config('ads.max_days'),
            'videoMaxSeconds' => (int) config('ads.video_max_seconds'),
            'videoMaxMb' => (int) config('ads.video_max_mb'),
            'balance' => Wallet::balance($request->user()),
        ]);
    }

    /** Save the campaign (not shown yet) and go to paying for it. */
    public function store(Request $request, Ffmpeg $ffmpeg): RedirectResponse
    {
        $company = $request->user()->company;
        abort_unless($company, 403);
        $maxDays = (int) config('ads.max_days');
        $data = $request->validate([
            'title' => ['required', 'string', 'max:90'],
            'body' => ['nullable', 'string', 'max:160'],
            'url' => ['required', 'url:https,http', 'max:500'],
            'starts_on' => ['required', 'date', 'after_or_equal:today', 'before:+1 year'],
            'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            'media' => ['required', 'file', 'mimetypes:image/jpeg,image/png,image/webp,'.implode(',', self::VIDEO_TYPES), 'max:'.((int) config('ads.video_max_mb') * 1024)],
            'pay' => ['required', 'in:qpay,wallet'],
        ]);
        $days = Ad::days($data['starts_on'], $data['ends_on']);
        if ($days > $maxDays) {
            throw ValidationException::withMessages(['ends_on' => __('A campaign can run at most :days days.', ['days' => $maxDays])]);
        }
        $media = $this->storeMedia($request->file('media'), $ffmpeg);

        $ad = $company->ads()->create([
            ...collect($data)->only('title', 'body', 'url', 'starts_on', 'ends_on')->all(),
            ...$media,
            'advertiser' => $company->name,
            'review_status' => Ad::UNPAID,
            'active' => true,
            'weight' => 1,
            'allow_adult' => false,
            'price' => Ad::priceFor($days),
            'created_by' => $request->user()->id,
        ]);
        if ($ad->video_path) {
            ProcessAdVideo::dispatch($ad->id);
        }

        return $this->checkout($request, $ad, $data['pay'] === 'wallet');
    }

    /** Pay for a campaign that was saved but not paid (the QPay page was left, or the wallet was short). */
    public function pay(Request $request, Ad $ad): RedirectResponse
    {
        $this->own($request, $ad);
        abort_unless($ad->review_status === Ad::UNPAID, 409);
        $data = $request->validate(['pay' => ['required', 'in:qpay,wallet']]);

        return $this->checkout($request, $ad, $data['pay'] === 'wallet');
    }

    /** Pause or resume an approved campaign (the paid days keep counting). */
    public function toggle(Request $request, Ad $ad): RedirectResponse
    {
        $this->own($request, $ad);
        abort_unless($ad->review_status === Ad::APPROVED, 409);
        $ad->update(['active' => ! $ad->active]);

        return back();
    }

    /** Throw away a campaign that was never paid for. */
    public function destroy(Request $request, Ad $ad): RedirectResponse
    {
        $this->own($request, $ad);
        abort_unless($ad->review_status === Ad::UNPAID, 409);
        $ad->deleteFiles();
        $ad->delete();

        return back()->with('status', 'campaign-deleted');
    }

    public function report(Request $request, Ad $ad): StreamedResponse
    {
        $this->own($request, $ad);

        return $ad->report();
    }

    /** The company's receipt for a payment, as a PDF. */
    public function receipt(Request $request, Receipt $receipt): \Symfony\Component\HttpFoundation\Response
    {
        $company = $request->user()->company;
        abort_unless($company && $receipt->company_id === $company->id, 404);

        return Receipts::pdf($receipt);
    }

    private function checkout(Request $request, Ad $ad, bool $fromWallet): RedirectResponse
    {
        try {
            return to_route('payments.show', $this->payments->startAd($request->user(), $ad, $fromWallet));
        } catch (InsufficientBalance) {
            return to_route('business')->withErrors(['payment' => __('Your wallet doesn’t have enough. Top it up or pay with QPay.')]);
        } catch (PaymentException $e) {
            report($e);

            return to_route('business')->withErrors(['payment' => __('Payment is unavailable right now. Please try again in a moment.')]);
        }
    }

    /**
     * A picture (cropped to the banner's shape) or a video (kept as uploaded until App\Jobs\ProcessAdVideo has
     * made the web version and its still). Videos longer than allowed are refused when ffmpeg can tell.
     *
     * @return array{image_path?: string, video_path?: string}
     */
    private function storeMedia(UploadedFile $file, Ffmpeg $ffmpeg): array
    {
        if (! in_array($file->getMimeType(), self::VIDEO_TYPES, true)) {
            if ($file->getSize() > 5 * 1024 * 1024) {
                throw ValidationException::withMessages(['media' => __('Pictures can be at most 5 MB.')]);
            }

            return ['image_path' => Images::storeCropped($file, 'ads', self::W, self::H)];
        }
        $max = (int) config('ads.video_max_seconds');
        if ($ffmpeg->available()) {
            try {
                $seconds = $ffmpeg->probe($file->getRealPath())['duration'];
            } catch (\Throwable) {
                throw ValidationException::withMessages(['media' => __('This video can’t be played. Try an MP4 file.')]);
            }
            if ($seconds > $max + 0.5) {
                throw ValidationException::withMessages(['media' => __('Videos can be at most :seconds seconds.', ['seconds' => $max])]);
            }
        }
        $ext = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'mp4');
        $ext = $ext === 'qt' ? 'mov' : $ext;

        return ['video_path' => $file->storeAs('ads/videos', Str::lower((string) Str::ulid()).'.'.$ext, 'public')];
    }

    private function own(Request $request, Ad $ad): void
    {
        abort_unless($ad->company_id && $ad->company_id === $request->user()->company?->id, 404);
    }

    private function companyCard(Company $company): array
    {
        return ['name' => $company->name, 'logo' => $company->logoUrl()];
    }

    /** A campaign as its company (and the admins reviewing it) see it. */
    public static function campaignCard(Ad $ad): array
    {
        return [
            ...$ad->only('id', 'title', 'body', 'url', 'advertiser', 'price', 'active', 'reject_reason'),
            'status' => $ad->status(),
            'starts_on' => $ad->starts_on->toDateString(),
            'ends_on' => $ad->ends_on?->toDateString(),
            'days' => $ad->ends_on ? Ad::days($ad->starts_on, $ad->ends_on) : null,
            'image' => $ad->imageUrl(),
            'video' => $ad->videoUrl(),
            'poster' => $ad->posterUrl(),
            'domain' => preg_replace('/^www\./', '', (string) parse_url($ad->url, PHP_URL_HOST)),
            'submitted_at' => $ad->submitted_at?->toIso8601String(),
            'past_start' => $ad->starts_on->lt(Carbon::today()),
            'receipt' => self::receiptFor($ad),
        ];
    }

    /** The receipt for a campaign's payment (the latest one, if it was paid more than once), for the list. */
    public static function receiptFor(Ad $ad): ?array
    {
        $receipt = Receipt::whereIn('payment_id', Payment::where('ad_id', $ad->id)->where('purpose', Payment::AD)->select('id'))->latest('id')->first();

        return $receipt ? ['id' => $receipt->id, 'number' => $receipt->number, 'ebarimt' => $receipt->ebarimt_status] : null;
    }
}
