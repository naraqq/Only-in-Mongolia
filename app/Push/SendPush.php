<?php

namespace App\Push;

use App\Models\PushSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Sends one notification to every device the given people allowed, on the queue so nobody waits for it.
 * Each person gets the text in their own language. Devices the push service says are gone are forgotten.
 */
class SendPush implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 2;

    /**
     * @param  list<int>  $userIds
     * @param  string  $key  a Texts key (followed, tipped, message, ...)
     * @param  array<string, mixed>  $vars  {name}, {amount}, {date}
     * @param  ?string  $body  shown under the title as is (a message's text), instead of the Texts line
     */
    public function __construct(
        public array $userIds,
        public string $key,
        public array $vars = [],
        public ?string $url = null,
        public ?string $tag = null,
        public ?string $title = null,
        public ?string $body = null,
    ) {}

    public function handle(): void
    {
        if (! Push::enabled()) {
            return;
        }

        $webPush = new WebPush(['VAPID' => [
            'subject' => config('services.webpush.subject'),
            'publicKey' => config('services.webpush.public_key'),
            'privateKey' => config('services.webpush.private_key'),
        ]], ['TTL' => 86400, 'urgency' => 'normal']);
        $webPush->setReuseVAPIDHeaders(true);

        $subs = PushSubscription::with('user:id,locale')->whereIn('user_id', $this->userIds)->get();
        foreach ($subs as $sub) {
            $locale = $sub->user?->locale;
            $line = Texts::line($this->key, $locale, $this->vars);
            $payload = json_encode([
                'title' => $this->title ?? ($this->body !== null ? ($this->vars['name'] ?? config('app.name')) : config('app.name')),
                'body' => $this->body ?? $line,
                'url' => $this->url ?? route('notifications'),
                'tag' => $this->tag,
            ], JSON_UNESCAPED_UNICODE);

            $webPush->queueNotification(Subscription::create([
                'endpoint' => $sub->endpoint,
                'keys' => ['p256dh' => $sub->public_key, 'auth' => $sub->auth_token],
                'contentEncoding' => $sub->content_encoding,
            ]), $payload);
        }

        foreach ($webPush->flush() as $report) {
            if ($report->isSubscriptionExpired()) {
                PushSubscription::where('endpoint', $report->getEndpoint())->delete();
            } elseif (! $report->isSuccess()) {
                Log::warning('Push failed', ['reason' => $report->getReason()]);
            }
        }
    }
}
