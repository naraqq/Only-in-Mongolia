<?php

namespace App\Http\Controllers;

use App\Models\Ad;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * Sponsored banners in the right-hand column: which to show, counting views (only when really on screen, once
 * per visitor per banner per day) and clicks (through here, then on to the advertiser).
 */
class AdController extends Controller
{
    /** How many banners the column shows. */
    public const SLOTS = 2;

    public function slot(Request $request): JsonResponse
    {
        // Brand safety: on 18+ creators' pages, only campaigns that opted in.
        $adult = $request->boolean('adult');
        $live = Ad::live()->when($adult, fn ($q) => $q->where('allow_adult', true))->get();

        return response()->json([
            'ads' => $this->pick($live)->map(fn (Ad $ad) => [
                'id' => $ad->id,
                'advertiser' => $ad->advertiser,
                'title' => $ad->title,
                'body' => $ad->body,
                'image' => $ad->imageUrl(),
                'href' => route('ads.go', $ad),
                'domain' => preg_replace('/^www\./', '', (string) parse_url($ad->url, PHP_URL_HOST)),
            ])->values(),
            'contact' => config('services.ads.contact'),
        ]);
    }

    /** The browser reports banners that were on screen. */
    public function views(Request $request): JsonResponse
    {
        $ids = collect($request->validate(['ids' => ['required', 'array', 'max:10'], 'ids.*' => ['integer']])['ids'])->unique();
        $key = 'ads_seen.'.now()->toDateString();
        $seen = $request->session()->get($key, []);
        $new = Ad::whereIn('id', $ids->diff($seen))->pluck('id')->all();
        Ad::tally($new, 'impressions');
        $request->session()->put($key, [...$seen, ...$new]);

        return response()->json(['ok' => true]);
    }

    /** A click: count it, then go to the advertiser (with our tags on the link). */
    public function go(Ad $ad): RedirectResponse
    {
        Ad::tally([$ad->id], 'clicks');

        return redirect()->away($ad->trackedUrl());
    }

    /** Up to SLOTS different banners, the higher a banner's weight the more often it's among them. */
    private function pick($ads)
    {
        $pool = $ads->all();
        $chosen = collect();
        while ($pool && $chosen->count() < self::SLOTS) {
            $total = array_sum(array_map(fn (Ad $a) => max(1, $a->weight), $pool));
            $roll = random_int(1, $total);
            foreach ($pool as $i => $ad) {
                if (($roll -= max(1, $ad->weight)) <= 0) {
                    $chosen->push($ad);
                    unset($pool[$i]);
                    break;
                }
            }
        }

        return $chosen;
    }
}
