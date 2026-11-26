<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\User;
use App\Payments\Payments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BundleTest extends TestCase
{
    use RefreshDatabase;

    private function creator(?array $bundles = null): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 9900, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'bundles' => $bundles,
        ]);
    }

    public function test_creators_set_bundle_discounts_and_fans_see_the_prices(): void
    {
        $creator = $this->creator();
        $this->actingAs($creator->user)->patch('/profile', [
            'name' => 'A', 'display_name' => 'Artist', 'price_monthly' => 9900, 'dm_policy' => 'followers',
            'bundles' => ['3' => 10, '6' => 0, '12' => 25],
        ])->assertSessionHasNoErrors();
        $this->assertSame(['3' => 10, '12' => 25], $creator->fresh()->bundles);

        $this->patch('/profile', ['name' => 'A', 'display_name' => 'Artist', 'price_monthly' => 9900, 'dm_policy' => 'followers', 'bundles' => ['3' => 80]])
            ->assertSessionHasErrors('bundles.3'); // too big a discount

        // 9,900 × 3 × 90% = 26,730 → 26,700; 9,900 × 12 × 75% = 89,100.
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p->where('creator.options', [
            ['months' => 1, 'discount' => 0, 'price' => 9900],
            ['months' => 3, 'discount' => 10, 'price' => 26700],
            ['months' => 12, 'discount' => 25, 'price' => 89100],
        ]));
    }

    public function test_a_bundle_payment_charges_the_bundle_price_and_buys_that_many_months(): void
    {
        $creator = $this->creator(['3' => 10]);
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($fan)->post('/@artist/subscribe', ['months' => 6])->assertStatus(422); // not offered
        $this->post('/@artist/subscribe', ['months' => 5])->assertSessionHasErrors('months');
        $this->post('/@artist/subscribe', ['months' => 3])->assertRedirect();

        $payment = Payment::sole();
        $this->assertSame([26700, 3, 5340], [$payment->amount, $payment->months, $payment->platform_fee]);
        $this->get("/payments/{$payment->id}")->assertInertia(fn ($p) => $p->where('days', 90)->where('payment.months', 3));

        $this->post("/payments/{$payment->id}/fake-pay");
        $this->assertEqualsWithDelta(90, now()->diffInDays($fan->subscriptions()->sole()->expires_at), 0.1);

        // Refunding a bundle takes back all of it.
        app(Payments::class)->refund($payment->fresh(), User::factory()->create(['is_admin' => true]), 'test');
        $this->assertFalse($creator->hasActiveSubscriber($fan));
    }

    public function test_checkout_starts_with_choosing_a_plan(): void
    {
        $creator = $this->creator(['3' => 10]);
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->get('/@artist/subscribe')->assertRedirect(route('login'));
        $this->actingAs($fan)->get('/@artist/subscribe?months=3')->assertInertia(fn ($p) => $p
            ->component('payments/checkout')->where('selected', 3)->has('options', 2)->where('until', null));
        $this->get('/@artist/subscribe?months=12')->assertInertia(fn ($p) => $p->where('selected', 1)); // not offered
        $this->actingAs($creator->user)->get('/@artist/subscribe')->assertStatus(422);
    }

    public function test_a_plain_month_still_works_without_sending_months(): void
    {
        $this->creator();
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($fan)->post('/@artist/subscribe')->assertRedirect();
        $this->assertSame([9900, 1], [Payment::sole()->amount, Payment::sole()->months]);
    }
}
