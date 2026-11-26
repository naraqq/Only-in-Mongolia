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

// Auto-renew: pay the next month from the fan's wallet in the last day before access ends.
Artisan::command('subscriptions:renew', function (\App\Payments\Renewals $renewals) {
    $r = $renewals->run();
    $this->info("Renewed {$r['renewed']}, short of money {$r['short']}, stopped {$r['skipped']}.");
})->purpose('Renew subscriptions with auto-renew on, from the wallet');

Schedule::command('subscriptions:renew')->hourly()->withoutOverlapping();

// Scheduled posts: once their time comes, tell subscribers (exactly once per post).
Artisan::command('posts:announce', function () {
    $n = 0;
    \App\Models\Post::with('creator')->whereNull('announced_at')->whereNotNull('publish_at')->where('publish_at', '<=', now())
        ->chunkById(100, function ($posts) use (&$n) {
            foreach ($posts as $post) {
                $post->forceFill(['announced_at' => now()])->saveQuietly();
                Notify::newPost($post);
                $n++;
            }
        });
    $this->info("Announced {$n} posts.");
})->purpose('Notify subscribers about scheduled posts that just went out');

Schedule::command('posts:announce')->everyMinute();
