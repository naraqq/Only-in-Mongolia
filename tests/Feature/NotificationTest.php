<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use App\Payments\FakeGateway;
use App\Payments\Payments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => 'everyone',
        ]);
    }

    private function fan(string $name = 'Fan'): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01', 'name' => $name]);
    }

    private function pay(Payment $payment): void
    {
        FakeGateway::markPaid($payment);
        app(Payments::class)->settle($payment);
        app(Payments::class)->settle($payment->fresh()); // a second settle must not notify twice
    }

    public function test_creators_hear_about_follows_subscriptions_renewals_tips_and_purchases(): void
    {
        $creator = $this->creator('artist');
        $fan = $this->fan('Bold');
        $payments = app(Payments::class);

        $this->actingAs($fan)->post('/@artist/follow');
        $this->post('/@artist/follow'); // following again isn't news
        $this->pay($payments->startSubscription($fan, $creator));
        $this->pay($payments->startSubscription($fan, $creator)); // renewal
        $this->pay($payments->startTip($fan, $creator, 5000, note: 'Thanks!'));
        $post = $creator->posts()->create(['body' => 'x', 'visibility' => Post::PUBLIC, 'price' => 7000]);
        $this->pay($payments->startPostPurchase($fan, $post));

        $user = $creator->user;
        $this->assertEqualsCanonicalizing(['purchased', 'tipped', 'subscribed', 'subscribed', 'followed'], $user->notifications()->pluck('type')->all());
        $this->assertSame(5, $user->unreadNotifications()->count());

        $this->actingAs($user)->get('/@artist')->assertInertia(fn ($p) => $p->where('unreadNotifications', 5));
        $this->get('/notifications')->assertInertia(fn ($p) => $p
            ->component('notifications/index')
            ->has('notifications', 5)
            ->where('notifications.0.read', false)
            ->where('notifications.0.actor.name', 'Bold')
            ->where('notifications', fn ($list) => collect($list)->contains(fn ($n) => $n['kind'] === 'tipped' && $n['data']['note'] === 'Thanks!' && $n['data']['amount'] === 5000)));
        $renewed = collect($user->notifications()->where('type', 'subscribed')->get())->pluck('data.renewed')->filter()->count();
        $this->assertSame(1, $renewed);

        // Looking (or the bell preloading the page) changes nothing; each stays new until it's opened.
        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('unreadNotifications', 5));

        // Opening one marks just that one and goes where it points.
        $tip = $user->notifications()->where('type', 'tipped')->first();
        $this->post(route('notifications.open', $tip->id))->assertRedirect();
        $this->assertNotNull($tip->fresh()->read_at);
        $this->get('/notifications')->assertInertia(fn ($p) => $p->where('unreadNotifications', 4)
            ->where('notifications', fn ($list) => collect($list)->firstWhere('kind', 'tipped')['read'] === true));

        // Someone else's notification can't be opened.
        $this->actingAs($fan)->post(route('notifications.open', $tip->id))->assertNotFound();

        $this->actingAs($user)->from('/notifications')->post(route('notifications.read-all'))->assertRedirect('/notifications');
        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('unreadNotifications', 0));
    }

    public function test_a_new_post_notifies_active_subscribers_only(): void
    {
        $creator = $this->creator('artist');
        [$sub, $expired, $follower] = [$this->fan(), $this->fan(), $this->fan()];
        $creator->subscriptions()->create(['user_id' => $sub->id, 'expires_at' => now()->addDay()]);
        $creator->subscriptions()->create(['user_id' => $expired->id, 'expires_at' => now()->subDay()]);
        $follower->following()->attach($creator->id);

        $this->actingAs($creator->user)->post('/studio/posts', ['body' => 'New!', 'visibility' => 'subscribers'])->assertSessionHasNoErrors();

        $this->assertSame(1, $sub->notifications()->where('type', 'new_post')->count());
        $this->assertSame(0, $expired->notifications()->count());
        $this->assertSame(0, $follower->notifications()->count());
        $this->actingAs($sub)->get('/notifications')->assertInertia(fn ($p) => $p
            ->where('notifications.0.kind', 'new_post')->where('notifications.0.actor.handle', 'artist')->where('notifications.0.url', route('creator.show', 'artist')));
    }

    public function test_fans_are_reminded_once_before_a_subscription_ends(): void
    {
        $creator = $this->creator('artist');
        [$soon, $later] = [$this->fan(), $this->fan()];
        $creator->subscriptions()->create(['user_id' => $soon->id, 'expires_at' => now()->addDays(2)]);
        $creator->subscriptions()->create(['user_id' => $later->id, 'expires_at' => now()->addDays(20)]);

        $this->artisan('subscriptions:remind')->expectsOutput('Sent 1 reminders.');
        $this->artisan('subscriptions:remind')->expectsOutput('Sent 0 reminders.');

        $this->assertSame(1, $soon->notifications()->where('type', 'expiring')->count());
        $this->assertSame(0, $later->notifications()->count());
    }
}
