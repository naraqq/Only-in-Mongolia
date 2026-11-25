<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use App\Payments\PaymentGateway;
use App\Payments\Payments;
use App\Payments\QPayGateway;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SubscriptionTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle, int $price = 10000): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => 'Creator', 'bio' => null, 'price_monthly' => $price, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_subscribing_with_the_test_gateway_unlocks_subscriber_posts(): void
    {
        $creator = $this->creator('artist', 9900);
        $secret = $creator->posts()->create(['body' => 'Secret', 'visibility' => Post::SUBSCRIBERS]);
        $fan = $this->fan();

        $this->actingAs($fan)->post('/@artist/subscribe')->assertRedirect();
        $payment = Payment::sole();
        $this->assertSame([9900, 1980, 'pending', 'fake'], [$payment->amount, $payment->platform_fee, $payment->status, $payment->provider]);

        $this->get("/payments/{$payment->id}")->assertInertia(fn ($p) => $p->component('payments/show')->where('payment.fake', true)->where('payment.amount', 9900));
        $this->getJson("/payments/{$payment->id}/status")->assertJson(['status' => 'pending']);
        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('posts.0.locked', 'subscribe')->where('subscribed', false));

        $this->post("/payments/{$payment->id}/fake-pay")->assertRedirect('/@artist');

        $this->assertSame('paid', $payment->fresh()->status);
        $this->getJson("/payments/{$payment->id}/status")->assertJson(['status' => 'paid']);
        $this->get('/@artist')->assertInertia(fn ($p) => $p
            ->where('subscribed', true)
            ->where('posts.0.id', $secret->id)
            ->where('posts.0.locked', null)
            ->where('posts.0.body', 'Secret')
            ->whereNot('subscribedUntil', null));
        $this->get('/dashboard')->assertInertia(fn ($p) => $p->has('subscriptions', 1)->where('subscriptions.0.handle', 'artist'));
        $this->actingAs($creator->user)->get('/studio')->assertInertia(fn ($p) => $p
            ->where('stats.subscribers', 1)
            ->where('stats.earnedThisMonth', 9900 - 1980));
    }

    public function test_settling_is_idempotent_and_renewals_add_to_the_current_period(): void
    {
        $creator = $this->creator('artist');
        $fan = $this->fan();
        $payments = app(Payments::class);

        $first = $payments->startSubscription($fan, $creator);
        \App\Payments\FakeGateway::markPaid($first);
        $payments->settle($first);
        $payments->settle($first->fresh());
        $this->post("/payments/{$first->id}/callback")->assertOk(); // QPay calling back again changes nothing
        $sub = $fan->subscriptions()->sole();
        $this->assertEqualsWithDelta(now()->addDays(30)->timestamp, $sub->expires_at->timestamp, 5);

        $second = $payments->startSubscription($fan, $creator);
        \App\Payments\FakeGateway::markPaid($second);
        $payments->settle($second);
        $this->assertEqualsWithDelta(now()->addDays(60)->timestamp, $sub->fresh()->expires_at->timestamp, 5);
    }

    public function test_expired_subscriptions_lock_posts_again(): void
    {
        $creator = $this->creator('artist');
        $creator->posts()->create(['body' => 'Secret', 'visibility' => Post::SUBSCRIBERS]);
        $fan = $this->fan();
        $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->subMinute()]);

        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p->where('subscribed', false)->where('posts.0.locked', 'subscribe'));
    }

    public function test_payments_are_private_and_you_cannot_subscribe_to_yourself(): void
    {
        $creator = $this->creator('artist');
        $fan = $this->fan();
        $this->actingAs($fan)->post('/@artist/subscribe');
        $payment = Payment::sole();

        $other = $this->fan();
        $this->actingAs($other)->get("/payments/{$payment->id}")->assertNotFound();
        $this->actingAs($other)->getJson("/payments/{$payment->id}/status")->assertNotFound();
        $this->actingAs($other)->post("/payments/{$payment->id}/fake-pay")->assertNotFound();

        $this->actingAs($creator->user)->post('/@artist/subscribe')->assertStatus(422);

        auth()->logout();
        $this->post('/@artist/subscribe')->assertRedirect('/login');
    }

    public function test_qpay_invoice_and_callback_only_trust_the_payment_check(): void
    {
        $this->app->instance(PaymentGateway::class, new QPayGateway('user', 'pass', 'ONLYIN_INVOICE', 'https://qpay.test/v2'));
        $this->app->forgetInstance(Payments::class);
        $paid = false;
        Http::fake([
            'qpay.test/v2/auth/token' => Http::response(['access_token' => 'tok', 'expires_in' => 3600]),
            'qpay.test/v2/invoice' => Http::response([
                'invoice_id' => 'INV-1', 'qr_text' => 'qr', 'qr_image' => 'iVBORw0KGgo=',
                'urls' => [['name' => 'Khan bank', 'description' => 'Хаан банк', 'logo' => 'https://qpay.test/khan.png', 'link' => 'khanbank://q?qPay_QRcode=qr']],
            ]),
            'qpay.test/v2/payment/check' => function () use (&$paid) {
                return Http::response(['count' => $paid ? 1 : 0, 'rows' => $paid ? [['payment_status' => 'PAID', 'payment_amount' => '12000']] : []]);
            },
        ]);

        $creator = $this->creator('artist', 12000);
        $fan = $this->fan();
        $this->actingAs($fan)->post('/@artist/subscribe')->assertRedirect();
        $payment = Payment::sole();

        Http::assertSent(fn ($r) => $r->url() === 'https://qpay.test/v2/invoice'
            && $r['invoice_code'] === 'ONLYIN_INVOICE' && $r['amount'] === 12000 && $r['sender_invoice_no'] === $payment->id
            && $r['callback_url'] === route('payments.callback', $payment) && $r->hasHeader('Authorization', 'Bearer tok'));
        $this->assertSame(['qpay', 'INV-1'], [$payment->provider, $payment->invoice_id]);
        $this->get("/payments/{$payment->id}")->assertInertia(fn ($p) => $p->where('payment.fake', false)->where('payment.bank_links.0.description', 'Хаан банк'));

        // A callback before QPay reports the money changes nothing; the test button doesn't exist for real payments.
        $this->post("/payments/{$payment->id}/callback")->assertOk()->assertSee('SUCCESS');
        $this->assertSame('pending', $payment->fresh()->status);
        $this->post("/payments/{$payment->id}/fake-pay")->assertNotFound();

        $paid = true;
        $this->get("/payments/{$payment->id}/callback")->assertOk();
        $this->assertSame('paid', $payment->fresh()->status);
        $this->assertTrue($creator->hasActiveSubscriber($fan));
    }
}
