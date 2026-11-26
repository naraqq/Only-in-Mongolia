<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use App\Models\WalletEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WalletTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    /** Top up through the (fake) QPay checkout. */
    private function topUp(User $fan, int $amount): Payment
    {
        $this->actingAs($fan)->post('/wallet/topup', ['amount' => $amount])->assertRedirect();
        $payment = Payment::where('purpose', Payment::TOPUP)->latest('id')->first();
        $this->post("/payments/{$payment->id}/fake-pay")->assertSessionHas('status', 'topped-up');

        return $payment->fresh();
    }

    public function test_a_top_up_reaches_the_wallet_once_and_is_not_a_sale(): void
    {
        $fan = $this->fan();
        $this->actingAs($fan)->post('/wallet/topup', ['amount' => 20000])->assertRedirect();
        $payment = Payment::sole();
        $this->assertSame([Payment::TOPUP, null, 0], [$payment->purpose, $payment->creator_profile_id, $payment->platform_fee]);
        $this->get("/payments/{$payment->id}")->assertInertia(fn ($p) => $p->component('payments/topup')->where('payment.amount', 20000));
        $this->assertSame(0, $fan->fresh()->wallet_balance); // nothing until it's paid

        $this->post("/payments/{$payment->id}/fake-pay");
        $this->post("/payments/{$payment->id}/callback"); // settling again adds nothing
        $this->assertSame(20000, $fan->fresh()->wallet_balance);
        $this->assertSame([[WalletEntry::TOPUP, 20000, 20000]], WalletEntry::get(['type', 'amount', 'balance_after'])->map->only('type', 'amount', 'balance_after')->map(fn ($e) => array_values($e))->all());

        $this->get('/wallet')->assertInertia(fn ($p) => $p->where('balance', 20000)->has('entries', 1)->has('payments', 0)->where('summary.spentAll', 0));
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin)->get('/admin')->assertInertia(fn ($p) => $p->where('kpis.gmvAll', 0)->where('kpis.walletHeld', 20000));
    }

    public function test_top_ups_are_limited(): void
    {
        $fan = $this->fan();
        $this->actingAs($fan)->post('/wallet/topup', ['amount' => 500])->assertSessionHasErrors('amount');
        $fan->forceFill(['wallet_balance' => config('creators.max_wallet') - 1000])->save();
        $this->post('/wallet/topup', ['amount' => 2000])->assertSessionHasErrors('amount'); // would go over the cap
        $this->post('/wallet/topup', ['amount' => 1000])->assertSessionHasNoErrors();
    }

    public function test_paying_from_the_wallet_delivers_at_once_and_counts_as_a_sale(): void
    {
        $creator = $this->creator('artist');
        $post = $creator->posts()->create(['body' => 'Paid', 'visibility' => Post::SUBSCRIBERS, 'price' => 3000]);
        $fan = $this->fan();
        $this->topUp($fan, 20000);

        $this->actingAs($fan)->post('/@artist/subscribe', ['wallet' => true])->assertRedirect();
        $sub = Payment::where('purpose', Payment::SUBSCRIPTION)->sole();
        $this->assertSame([Payment::PAID, 'wallet', 2000], [$sub->status, $sub->provider, $sub->platform_fee]);
        $this->assertTrue($fan->subscriptions()->active()->where('creator_profile_id', $creator->id)->exists());
        $this->get("/payments/{$sub->id}")->assertInertia(fn ($p) => $p->where('payment.status', 'paid')->where('payment.wallet', true));

        $this->post('/@artist/tip', ['amount' => 5000, 'note' => 'Баярлалаа', 'wallet' => true]);
        $this->assertSame(5000, Message::sole()->tip_amount);

        $this->post("/posts/{$post->id}/buy", ['wallet' => true]);
        $this->assertSame(2000, $fan->fresh()->wallet_balance); // 20000 − 10000 − 5000 − 3000
        $this->assertSame([10000, 5000, 3000], WalletEntry::where('type', WalletEntry::SPEND)->orderBy('id')->pluck('amount')->map(fn ($a) => -$a)->all());

        // Too little left: nothing is bought or charged.
        $this->post('/@artist/tip', ['amount' => 5000, 'wallet' => true])->assertSessionHasErrors('payment');
        $this->assertSame(1, Payment::where('purpose', Payment::TIP)->count());
        $this->assertSame(2000, $fan->fresh()->wallet_balance);

        // It's a sale like any other: the creator earns it, the admin sees it, the fan's wallet page lists it.
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin)->get('/admin')->assertInertia(fn ($p) => $p->where('kpis.gmvAll', 18000)->where('kpis.walletHeld', 2000));
        $this->actingAs($fan)->get('/wallet')->assertInertia(fn ($p) => $p->where('summary.spentAll', 18000)->has('payments', 3)->where('payments.0.wallet', true));
    }

    public function test_refunds_go_back_to_the_wallet_and_spent_top_ups_cannot_be_reversed(): void
    {
        $this->creator('artist');
        $fan = $this->fan();
        $topup = $this->topUp($fan, 15000);
        $this->actingAs($fan)->post('/@artist/subscribe', ['wallet' => true]);
        $sub = Payment::where('purpose', Payment::SUBSCRIPTION)->sole();
        $admin = User::factory()->create(['is_admin' => true]);

        // 5000 left: the 15000 top-up can't be taken back.
        $this->actingAs($admin)->post("/admin/payments/{$topup->id}/refund", ['reason' => 'Asked'])->assertStatus(409);
        $this->assertSame(Payment::PAID, $topup->fresh()->status);

        // Refunding the wallet-paid subscription puts the money back in the wallet...
        $this->post("/admin/payments/{$sub->id}/refund", ['reason' => 'Charged twice'])->assertSessionHasNoErrors();
        $this->assertSame(15000, $fan->fresh()->wallet_balance);
        $this->assertFalse($fan->subscriptions()->active()->exists());

        // ...and now the top-up can be reversed.
        $this->post("/admin/payments/{$topup->id}/refund", ['reason' => 'Asked'])->assertSessionHasNoErrors();
        $this->assertSame(0, $fan->fresh()->wallet_balance);
        $this->assertSame(
            [WalletEntry::TOPUP, WalletEntry::SPEND, WalletEntry::REFUND, WalletEntry::REVERSAL],
            WalletEntry::orderBy('id')->pluck('type')->all(),
        );
    }

    public function test_the_wallet_page_is_mine_only(): void
    {
        $this->get('/wallet')->assertRedirect('/login');
        $creator = $this->creator('artist');
        [$me, $other] = [$this->fan(), $this->fan()];
        Payment::create(['user_id' => $other->id, 'creator_profile_id' => $creator->id, 'purpose' => Payment::TIP, 'amount' => 7777,
            'platform_fee' => 0, 'status' => Payment::PAID, 'provider' => 'fake', 'paid_at' => now()]);
        $me->subscriptions()->create(['creator_profile_id' => $creator->id, 'expires_at' => now()->addDays(10)]);

        $this->actingAs($me)->get('/wallet')->assertInertia(fn ($p) => $p->has('payments', 0)->has('subscriptions', 1)->where('subscriptions.0.handle', 'artist'));
    }
}
