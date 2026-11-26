<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(\App\Services\VerifyMn::class, fn () => \App\Services\VerifyMn::fromConfig());

        // Automatic upload scanning: Sightengine when configured, otherwise none (the blocklist still applies).
        $this->app->bind(\App\Moderation\Scanner::class, fn () => config('moderation.driver') === 'sightengine' && config('moderation.sightengine.user')
            ? new \App\Moderation\SightengineScanner(config('moderation.sightengine'))
            : new \App\Moderation\NoScanner());

        // QPay when a merchant account is configured; otherwise (and never in production) a fake gateway for local work.
        $this->app->singleton(\App\Payments\PaymentGateway::class, function () {
            $c = config('services.qpay');
            if (empty($c['username']) && ! $this->app->isProduction()) {
                return new \App\Payments\FakeGateway;
            }

            return new \App\Payments\QPayGateway((string) $c['username'], (string) $c['password'], (string) $c['invoice_code'], rtrim((string) $c['base_url'], '/'));
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
