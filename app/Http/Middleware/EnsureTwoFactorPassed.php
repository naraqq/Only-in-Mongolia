<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * People who turned on authenticator codes must enter one after signing in, before using the app.
 * The check is remembered for the session; a new sign-in (or a new session) asks again.
 */
class EnsureTwoFactorPassed
{
    private const KEY = 'two_factor_passed';

    /** Routes that must stay open while the code is pending. */
    private const OPEN = ['two-factor.challenge', 'two-factor.verify', 'logout', 'locale', 'payments.callback'];

    public static function passed(Request $request): bool
    {
        return $request->hasSession() && $request->session()->get(self::KEY) === $request->user()?->id;
    }

    public static function markPassed(Request $request): void
    {
        $request->session()->put(self::KEY, $request->user()->id);
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && $user->hasTwoFactor() && ! self::passed($request) && ! $request->routeIs(...self::OPEN)) {
            if (! $request->isMethodSafe()) {
                abort(403, 'Enter your two-step code first.');
            }
            $request->session()->put('url.intended', $request->fullUrl());

            return redirect()->route('two-factor.challenge');
        }

        return $next($request);
    }
}
