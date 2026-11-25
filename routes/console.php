<?php

use Illuminate\Foundation\Inspiring;
use App\Models\Subscription;
use App\Support\Notify;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// QPay can't charge automatically, so fans renew by hand: remind them 3 days before a subscription ends (once per period).
Artisan::command('subscriptions:remind', function () {
    $sent = 0;
    Subscription::with('creator')->whereBetween('expires_at', [now(), now()->addDays(3)])->chunkById(200, function ($subs) use (&$sent) {
        foreach ($subs as $sub) {
            $expires = $sub->expires_at->toIso8601String();
            $already = DB::table('notifications')->where('notifiable_id', $sub->user_id)->where('type', 'expiring')
                ->where('data', 'like', '%"handle":'.json_encode($sub->creator->handle).'%')
                ->where('data', 'like', '%'.trim(json_encode($expires), '"').'%')->exists();
            if (! $already && $sub->user) {
                Notify::expiring($sub->user, $sub->creator, $expires);
                $sent++;
            }
        }
    });
    $this->info("Sent {$sent} reminders.");
})->purpose('Remind fans whose subscriptions end within 3 days');

Schedule::command('subscriptions:remind')->dailyAt('10:00');
