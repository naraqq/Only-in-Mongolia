<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Ad;
use App\Support\Images;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

/** Admin → Sponsored: other companies' banners, when they run, and how they did (the advertiser's report). */
class AdController extends Controller
{
    /** Banners are stored at twice the 600×500 shown, so they stay sharp. */
    private const W = 1200;

    private const H = 1000;

    public function index(Request $request): Response
    {
        $days = in_array((int) $request->query('days'), [7, 30, 90], true) ? (int) $request->query('days') : 30;
        $since = now()->subDays($days - 1)->toDateString();
        $period = DB::table('ad_stats')->where('day', '>=', $since)->groupBy('ad_id')
            ->selectRaw('ad_id, sum(impressions) as impressions, sum(clicks) as clicks')->get()->keyBy('ad_id');
        $total = DB::table('ad_stats')->groupBy('ad_id')->selectRaw('ad_id, sum(impressions) as impressions, sum(clicks) as clicks')->get()->keyBy('ad_id');

        return Inertia::render('admin/ads', [
            'days' => $days,
            'ads' => Ad::latest('id')->get()->map(fn (Ad $ad) => [
                ...$ad->only('id', 'advertiser', 'title', 'body', 'url', 'active', 'weight', 'allow_adult'),
                'starts_on' => $ad->starts_on->toDateString(),
                'ends_on' => $ad->ends_on?->toDateString(),
                'image' => $ad->imageUrl(),
                'status' => $ad->status(),
                'impressions' => (int) ($period[$ad->id]->impressions ?? 0),
                'clicks' => (int) ($period[$ad->id]->clicks ?? 0),
                'total_impressions' => (int) ($total[$ad->id]->impressions ?? 0),
                'total_clicks' => (int) ($total[$ad->id]->clicks ?? 0),
            ]),
            'contact' => config('services.ads.contact'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request, true);
        Ad::create([...$data, 'image_path' => Images::storeCropped($request->file('image'), 'ads', self::W, self::H), 'created_by' => $request->user()->id]);

        return back()->with('status', 'ad-saved');
    }

    public function update(Request $request, Ad $ad): RedirectResponse
    {
        $data = $this->validated($request, false);
        if ($request->hasFile('image')) {
            $old = $ad->image_path;
            $data['image_path'] = Images::storeCropped($request->file('image'), 'ads', self::W, self::H);
            Storage::disk('public')->delete($old);
        }
        $ad->update($data);

        return back()->with('status', 'ad-saved');
    }

    /** Pause or resume. */
    public function toggle(Ad $ad): RedirectResponse
    {
        $ad->update(['active' => ! $ad->active]);

        return back();
    }

    public function destroy(Ad $ad): RedirectResponse
    {
        Storage::disk('public')->delete($ad->image_path);
        $ad->delete();

        return back();
    }

    /** One banner's day-by-day numbers, as a CSV to send the advertiser. */
    public function report(Ad $ad)
    {
        $rows = DB::table('ad_stats')->where('ad_id', $ad->id)->orderBy('day')->get();
        $name = 'sponsored-'.$ad->id.'-'.str($ad->advertiser)->slug().'.csv';

        return response()->streamDownload(function () use ($rows, $ad) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Advertiser', $ad->advertiser]);
            fputcsv($out, ['Banner', $ad->title]);
            fputcsv($out, []);
            fputcsv($out, ['Day', 'Views', 'Clicks', 'Click rate %']);
            foreach ($rows as $r) {
                fputcsv($out, [$r->day, $r->impressions, $r->clicks, $r->impressions ? round($r->clicks / $r->impressions * 100, 2) : 0]);
            }
            fputcsv($out, ['Total', $rows->sum('impressions'), $rows->sum('clicks'), $rows->sum('impressions') ? round($rows->sum('clicks') / $rows->sum('impressions') * 100, 2) : 0]);
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv']);
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
            'active' => ['boolean'],
            'image' => [$creating ? 'required' : 'nullable', 'image', 'mimes:jpeg,png,webp', 'max:5120'],
        ]);
        unset($data['image']);

        return $data;
    }
}
