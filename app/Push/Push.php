<?php

namespace App\Push;

use App\Models\User;
use Illuminate\Notifications\Notification;

/**
 * Phone and browser push notifications (Web Push). Off until VAPID keys are set: `php artisan push:keys`
 * prints them for the .env file. Also the notification channel used by App\Notifications\Activity.
 */
class Push
{
    public static function enabled(): bool
    {
        return filled(config('services.webpush.public_key')) && filled(config('services.webpush.private_key')) && self::opensslReady();
    }

    /** Push one Activity (the bell) to the person's devices too. */
    public function send(User $notifiable, Notification $notification): void
    {
        if (! self::enabled() || ! method_exists($notification, 'toPush')) {
            return;
        }
        $job = $notification->toPush($notifiable);
        if ($job instanceof SendPush) {
            dispatch($job);
        }
    }

    /** Whether it's worth adding the push channel for this person (they allowed it on some device). */
    public static function wants(User $user): bool
    {
        return self::enabled() && $user->pushSubscriptions()->exists();
    }

    /**
     * Windows only (local development): PHP's OpenSSL can't make the elliptic-curve keys Web Push encrypts with
     * unless OPENSSL_CONF points at a config file before PHP starts (XAMPP ships one in php\extras\ssl).
     * Without it push stays off instead of failing on every send. Linux (Docker, production) needs nothing.
     */
    public static function opensslReady(): bool
    {
        return PHP_OS_FAMILY !== 'Windows' || (bool) getenv('OPENSSL_CONF');
    }
}
