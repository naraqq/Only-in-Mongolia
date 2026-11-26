<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\PromoCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PromotionTest extends TestCase
{
    use RefreshDatabase;

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'bundles' => ['3' => 10],
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_free_trial_once_and_only_for_new_subscribers(): void
    {
        $creator = $this->creator();
        $this->actingAs($creator->user)->put('/studio/promotions/trial', ['days' => 7])->assertSessionHasNoErrors();
        $this->put('/studio/promotions/trial', ['days' => 5])->assertSessionHasErrors('days'); // 3, 7 or 14 only

        $fan = $this->fan();
        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p->where('creator.trial_days', 7));
        $this->post('/@artist/trial')->assertRedirect('/@artist');
        $sub = $fan->subscriptions()->sole();
        $this->assertTrue($sub->expires_at->between(now()->addDays(7)->subMinute(), now()->addDays(7)->addMinute()));
        $this->assertSame(0, Payment::count());

        // Once only, even after it has run out.
        $sub->update(['expires_at' => now()->subDay()]);
        $this->post('/@artist/trial')->assertSessionHasErrors('trial');
        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('creator.trial_days', null));

        // Someone who already paid before doesn't get one either.
        $payer = $this->fan();
        $payer->subscriptions()->create(['creator_profile_id' => $creator->id, 'expires_at' => now()->subMonth()]);
        $this->actingAs($payer)->post('/@artist/trial')->assertSessionHasErrors('trial');
    }

    public function test_discount_codes_take_money_off_once_per_fan_and_respect_limits(): void
    {
        $creator = $this->creator();
        $this->actingAs($creator->user)->post('/studio/promotions/codes', ['code' => 'summer-20', 'percent_off' => 20, 'max_uses' => 2])->assertSessionHasNoErrors();
        $code = PromoCode::sole();
        $this->assertSame('SUMMER20', $code->code);
        $this->post('/studio/promotions/codes', ['code' => 'SUMMER20', 'percent_off' => 10])->assertSessionHasErrors('code'); // taken

        $fan = $this->fan();
        $this->actingAs($fan)->getJson('/@artist/promo?code=summer20')->assertJson(['ok' => true, 'percent_off' => 20]);
        $this->getJson('/@artist/promo?code=nope')->assertJson(['ok' => false, 'reason' => 'not_found']);

        // 3-month bundle: 30,000 − 10% = 27,000, then −20% = 21,600.
        $this->post('/@artist/subscribe', ['months' => 3, 'code' => 'SUMMER20']);
        $p = Payment::sole();
        $this->assertSame([21600, 5400, $code->id, 4320], [$p->amount, $p->discount, $p->promo_code_id, $p->platform_fee]);
        $this->assertSame(0, $code->fresh()->uses); // counted when paid, not when started
        $this->post("/payments/{$p->id}/fake-pay");
        $this->assertSame(1, $code->fresh()->uses);

        $this->getJson('/@artist/promo?code=SUMMER20')->assertJson(['ok' => false, 'reason' => 'already_used']);
        $this->post('/@artist/subscribe', ['code' => 'SUMMER20'])->assertSessionHasErrors('code');

        // Used up after two fans.
        $second = $this->fan();
        $this->actingAs($second)->post('/@artist/subscribe', ['code' => 'SUMMER20']);
        $this->post('/payments/'.Payment::latest('id')->value('id').'/fake-pay');
        $this->actingAs($this->fan())->getJson('/@artist/promo?code=SUMMER20')->assertJson(['ok' => false, 'reason' => 'used_up']);

        // Switched off by the creator.
        $this->actingAs($creator->user)->post("/studio/promotions/codes/{$code->id}/toggle");
        $this->assertFalse($code->fresh()->active);
    }

    public function test_creators_manage_only_their_own_codes(): void
    {
        $creator = $this->creator();
        $code = $creator->promoCodes()->create(['code' => 'MINE', 'percent_off' => 10]);
        $this->actingAs($this->fan())->get('/studio/promotions')->assertNotFound();
        $this->actingAs($this->fan())->post("/studio/promotions/codes/{$code->id}/toggle")->assertNotFound();
        $this->actingAs($creator->user)->get('/studio/promotions')->assertInertia(fn ($p) => $p->component('studio/promotions')->has('codes', 1));
    }
}
