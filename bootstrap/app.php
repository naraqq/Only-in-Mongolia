<?php

use App\Http\Middleware\EnsureNotBanned;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetLocale;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        if (env('TRUST_DOCKER_PROXY', false)) {
            $middleware->trustProxies(at: '*');
        }

        // QPay calls this server-to-server; it only triggers a status check with QPay, so it needs no CSRF token.
        $middleware->validateCsrfTokens(except: ['payments/*/callback']);
        $middleware->web(append: [
            SetLocale::class,
            EnsureNotBanned::class,
            \App\Http\Middleware\EnsureTwoFactorPassed::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        Integration::handles($exceptions);
    })->create();
