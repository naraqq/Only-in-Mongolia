<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Site-wide 18+ gate. Visitors must confirm they're adults before seeing anything; signed-in users
 * already gave a date of birth (checked at sign-up), so they pass. The confirmation lasts a year (cookie).
 */
class EnsureAgeConfirmed
{
    public const COOKIE = 'age_ok';

    /** Routes that must work before confirming: the gate itself, language switch, phone-login callback. */
    private const EXEMPT = ['age-gate', 'age-gate.confirm', 'locale', 'verify-mn.callback'];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() || $request->cookie(self::COOKIE) === '1' || $request->routeIs(...self::EXEMPT)) {
            return $next($request);
        }

        if ($request->isMethod('GET')) {
            $request->session()->put('url.intended', $request->fullUrl());
        }

        return redirect()->route('age-gate');
    }
}
