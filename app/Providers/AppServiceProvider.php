<?php

namespace App\Providers;

use App\Models\User;
use App\Moderation\NoScanner;
use App\Moderation\Scanner;
use App\Moderation\SightengineScanner;
use App\Payments\FakeGateway;
use App\Payments\PaymentGateway;
use App\Payments\QPayGateway;
use App\Services\VerifyMn;
use App\Support\Live;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(VerifyMn::class, fn () => VerifyMn::fromConfig());

        // Automatic upload scanning: Sightengine when configured, otherwise none (the blocklist still applies).
        $this->app->bind(Scanner::class, fn () => config('moderation.driver') === 'sightengine' && config('moderation.sightengine.user')
            ? new SightengineScanner(config('moderation.sightengine'))
            : new NoScanner);

        // QPay when a merchant account is configured; otherwise (and never in production) a fake gateway for local work.
        $this->app->singleton(PaymentGateway::class, function () {
            $c = config('services.qpay');
            if (empty($c['username']) && ! $this->app->isProduction()) {
                return new FakeGateway;
            }

            return new QPayGateway((string) $c['username'], (string) $c['password'], (string) $c['invoice_code'], rtrim((string) $c['base_url'], '/'));
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Every notification saved for someone updates their bell in real time (App\Support\Live).
        Event::listen(NotificationSent::class, function (NotificationSent $event) {
            if ($event->channel === 'database' && $event->notifiable instanceof User) {
                Live::user($event->notifiable->id, 'notification');
            }
        });

        RateLimiter::for('two-factor-verify', fn (Request $request) => Limit::perMinute(6)
            ->by($request->user()->getAuthIdentifier())
            ->response(function (Request $request, array $headers) {
                $message = __('Too many verification attempts. Wait up to one minute and try again.');
                if ($request->header('X-Inertia')) {
                    return redirect()->route('two-factor.challenge')
                        ->withErrors(['code' => $message]);
                }

                return response($message, 429, $headers);
            }));
    }
}
