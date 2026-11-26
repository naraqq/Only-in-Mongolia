<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class SetLocale
{
    public const SUPPORTED = ['mn', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        // This browser's choice, else the account's (signing in on a new phone keeps your language).
        $user = $request->user();
        $locale = $request->session()->get('locale') ?? $user?->locale;

        if (in_array($locale, self::SUPPORTED, true)) {
            App::setLocale($locale);
        }
        // The account remembers it too, for text written while they're away (push notifications).
        if ($user && $user->locale !== App::getLocale()) {
            $user->forceFill(['locale' => App::getLocale()])->saveQuietly();
        }

        return $next($request);
    }
}
