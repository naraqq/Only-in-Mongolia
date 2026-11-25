<?php

namespace App\Http\Controllers;

use App\Http\Middleware\EnsureAgeConfirmed;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AgeGateController extends Controller
{
    public function show(): Response
    {
        return Inertia::render('age-gate');
    }

    /** "I'm 18 or older": remember it for a year on this device, then continue where they were going. */
    public function confirm(Request $request): RedirectResponse
    {
        $request->validate(['adult' => ['accepted']]);

        return redirect()->intended(route('home'))
            ->withCookie(cookie(EnsureAgeConfirmed::COOKIE, '1', 60 * 24 * 365));
    }
}
