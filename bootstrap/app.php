<?php

use App\Http\Middleware\EnsureNotBanned;
use App\Http\Middleware\EnsureTwoFactorPassed;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetLocale;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Sentry\Laravel\Integration;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
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
            EnsureTwoFactorPassed::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        Integration::handles($exceptions);

        // Our own error pages (resources/js/pages/error.tsx) instead of Laravel's. JSON callers still get JSON,
        // and while debugging, server errors keep Laravel's detailed page.
        $exceptions->respond(function (Response $response, Throwable $e, Request $request) {
            $status = $response->getStatusCode();
            if (! in_array($status, [403, 404, 419, 429, 500, 503], true)
                || ($status >= 500 && config('app.debug'))
                || ($request->expectsJson() && ! $request->header('X-Inertia'))) {
                return $response;
            }
            try {
                // Unknown pages never reach the session middleware, so fall back to the browser's language.
                $locale = ($request->hasSession() ? $request->session()->get('locale') : null)
                    ?? $request->user()?->locale
                    ?? $request->getPreferredLanguage(['mn', 'en'])
                    ?? config('app.locale');
                app()->setLocale(in_array($locale, SetLocale::SUPPORTED, true) ? $locale : 'mn');

                return Inertia::render('error', [
                    'status' => $status,
                    'retryAfter' => (int) $response->headers->get('Retry-After') ?: null,
                    'name' => config('app.name'),
                    'locale' => app()->getLocale(),
                ])->toResponse($request)->setStatusCode($status)->withHeaders(array_filter(['Retry-After' => $response->headers->get('Retry-After')]));
            } catch (Throwable) {
                return $response; // the plain branded page (resources/views/errors)
            }
        });
    })->create();
