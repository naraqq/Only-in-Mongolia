<?php

use App\Media\ChunkedUploads;
use App\Media\Files;
use App\Models\Post;
use App\Models\Subscription;
use App\Payments\Renewals;
use App\Push\Push;
use App\Support\Live;
use App\Support\Notify;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Storage;
use Minishlink\WebPush\VAPID;

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
Artisan::command('subscriptions:renew', function (Renewals $renewals) {
    $r = $renewals->run();
    $this->info("Renewed {$r['renewed']}, short of money {$r['short']}, stopped {$r['skipped']}.");
})->purpose('Renew subscriptions with auto-renew on, from the wallet');

Schedule::command('subscriptions:renew')->hourly()->withoutOverlapping();

// Scheduled posts: once their time comes, tell subscribers (exactly once per post).
Artisan::command('posts:announce', function () {
    $n = 0;
    Post::with('creator')->whereNull('announced_at')->whereNotNull('publish_at')->where('publish_at', '<=', now())
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

// Live Q&As: when one starts, remind the fans who asked (exactly once per Q&A).
Artisan::command('qa:start', function () {
    $n = 0;
    Post::with('creator')->whereNull('qa_announced_at')->whereNotNull('qa_starts_at')->where('qa_starts_at', '<=', now())
        ->where('qa_ends_at', '>', now())->published()
        ->chunkById(100, function ($posts) use (&$n) {
            foreach ($posts as $post) {
                $post->forceFill(['qa_announced_at' => now()])->saveQuietly();
                Notify::qaLive($post);
                Live::qa($post->id);
                $n++;
            }
        });
    $this->info("Started {$n} Q&As.");
})->purpose('Tell fans who asked for a reminder that a live Q&A has started');

Schedule::command('qa:start')->everyMinute();

// Stamped photo copies (see App\Media\Stamp) are rebuilt on demand, so ones nobody opened for a week can go.
Artisan::command('media:prune-stamps {--days=7}', function () {
    $cutoff = now()->subDays((int) $this->option('days'))->getTimestamp();
    $disk = Storage::disk('local');
    $gone = 0;
    foreach ($disk->allFiles('stamped') as $file) {
        if ($disk->lastModified($file) < $cutoff) {
            $disk->delete($file);
            $gone++;
        }
    }
    foreach ($disk->directories('stamped') as $dir) {
        if (! $disk->allFiles($dir)) {
            $disk->deleteDirectory($dir);
        }
    }
    // Local copies of R2 files (for stamping and scanning) are downloaded again when needed.
    $cached = Files::pruneCache((int) $this->option('days'));
    $this->info("Removed {$gone} stamped copies and {$cached} cached downloads.");
})->purpose('Delete stamped photo copies and cached media downloads nobody has used recently');

Schedule::command('media:prune-stamps')->dailyAt('04:30');

// Files sent in pieces (App\Media\ChunkedUploads) that never made it into a post: the pieces, and finished files nobody used.
Artisan::command('media:prune-uploads {--hours=24}', function () {
    $gone = ChunkedUploads::prune((int) $this->option('hours'));
    $this->info("Removed {$gone} unused uploads.");
})->purpose('Delete unfinished or unused uploads older than a day');

Schedule::command('media:prune-uploads')->hourly()->withoutOverlapping();

// Web Push keys (VAPID): run once per site and put the two lines in .env. Changing them later signs everyone out of push.
Artisan::command('push:keys', function () {
    if (! Push::opensslReady()) {
        $this->error('On Windows, set OPENSSL_CONF first, e.g. in Git Bash: export OPENSSL_CONF="C:\xampp\php\extras\ssl\openssl.cnf"');

        return 1;
    }
    $keys = VAPID::createVapidKeys();
    $this->line('VAPID_PUBLIC_KEY='.$keys['publicKey']);
    $this->line('VAPID_PRIVATE_KEY='.$keys['privateKey']);
})->purpose('Make the key pair for push notifications');
