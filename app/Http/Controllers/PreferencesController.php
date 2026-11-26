<?php

namespace App\Http\Controllers;

use App\Support\Appearance;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;

/** Small per-person settings that live on the server (not in the browser): the theme, and recent searches. */
class PreferencesController extends Controller
{
    /** Remember the theme: on the account when signed in, and in a long-lived cookie for the first paint. */
    public function appearance(Request $request, string $mode): RedirectResponse
    {
        $request->user()?->forceFill(['appearance' => $mode === 'system' ? null : $mode])->save();
        Cookie::queue(Appearance::COOKIE, $mode, 60 * 24 * 365);

        return back();
    }

    public function clearSearches(Request $request): RedirectResponse|Response
    {
        $request->user()->searchHistories()->delete();

        return $request->wantsJson() ? response()->noContent() : back();
    }

    public function forgetSearch(Request $request): RedirectResponse|Response
    {
        $query = (string) $request->validate(['q' => ['required', 'string', 'max:100']])['q'];
        $request->user()->searchHistories()->where('query', $query)->delete();

        return $request->wantsJson() ? response()->noContent() : back();
    }
}
