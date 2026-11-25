<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Payout;
use App\Models\User;
use App\Payments\Earnings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PayoutTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000123456', 'account_holder' => 'Bat', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    /** A paid payment of $amount (20% fee) $daysAgo days ago. */
    private function earn(CreatorProfile $creator, int $amount, int $daysAgo, string $purpose = 'subscription'): void
    {
        Payment::create([
            'user_id' => User::factory()->create()->id, 'creator_profile_id' => $creator->id, 'purpose' => $purpose,
            'amount' => $amount, 'platform_fee' => intdiv($amount * 20, 100), 'status' => Payment::PAID, 'provider' => 'fake',
            'invoice_id' => 'X', 'paid_at' => now()->subDays($daysAgo),
        ]);
    }

    public function test_balance_holds_recent_earnings_and_counts_payouts(): void
    {
        $creator = $this->creator('artist');
        $this->earn($creator, 50000, 10); // net 40,000, cleared
        $this->earn($creator, 25000, 8, 'tip'); // net 20,000, cleared
        $this->earn($creator, 10000, 2); // net 8,000, on hold
        Payment::create(['user_id' => User::factory()->create()->id, 'creator_profile_id' => $creator->id, 'amount' => 99999, 'platform_fee' => 0, 'status' => 'pending', 'provider' => 'fake']);

        $e = new Earnings($creator);
        $this->assertSame([68000, 8000, 60000], [$e->earned(), $e->onHold(), $e->available()]);

        $creator->payouts()->create(['amount' => 30000, 'status' => Payout::PAID, 'bank_name' => 'x', 'bank_account' => 'x', 'account_holder' => 'x']);
        $creator->payouts()->create(['amount' => 5000, 'status' => Payout::REJECTED, 'bank_name' => 'x', 'bank_account' => 'x', 'account_holder' => 'x']);
        $this->assertSame([30000, 30000], [$e->paidOut(), $e->available()]); // rejected money comes back

        $this->actingAs($creator->user)->get('/studio/earnings')->assertInertia(fn ($p) => $p
            ->component('studio/earnings')
            ->where('balance.available', 30000)->where('balance.onHold', 8000)->where('balance.paidOut', 30000)
            ->where('bank.account', '•••• 3456')
            ->has('recent', 3)->has('payouts', 2));
    }

    public function test_creators_request_a_payout_and_admins_mark_it_paid(): void
    {
        $creator = $this->creator('artist');
        $this->earn($creator, 50000, 10); // 40,000 available
        $admin = User::factory()->create(['is_admin' => true]);

        $this->actingAs($creator->user)->post('/studio/earnings/payout', ['amount' => 50000])->assertSessionHasErrors('amount'); // more than available
        $this->post('/studio/earnings/payout', ['amount' => 1000])->assertSessionHasErrors('amount'); // under the minimum
        $this->post('/studio/earnings/payout', ['amount' => 25000])->assertSessionHasNoErrors();
        $this->post('/studio/earnings/payout', ['amount' => 10000])->assertSessionHasErrors('amount'); // one open request at a time
        $payout = Payout::sole();
        $this->assertSame(['requested', 25000, 'Хаан банк', '5000123456', 'Bat'], [$payout->status, $payout->amount, $payout->bank_name, $payout->bank_account, $payout->account_holder]);
        $this->assertSame(15000, (new Earnings($creator))->available());

        // Only admins see the queue (with the full account number).
        $this->get('/admin/payouts')->assertForbidden();
        $this->actingAs($admin)->get('/admin/payouts')->assertInertia(fn ($p) => $p
            ->has('open', 1)->where('open.0.bank.account', '5000123456')->where('open.0.available', 40000));

        $this->post("/admin/payouts/{$payout->id}/decide", ['decision' => 'paid'])->assertSessionHasErrors('reference');
        $this->post("/admin/payouts/{$payout->id}/decide", ['decision' => 'paid', 'reference' => 'KHAN 123'])->assertRedirect();
        $this->post("/admin/payouts/{$payout->id}/decide", ['decision' => 'rejected', 'reference' => 'x'])->assertStatus(409);

        $payout->refresh();
        $this->assertSame(['paid', 'KHAN 123', $admin->id], [$payout->status, $payout->reference, $payout->processed_by]);
        $this->assertSame(1, $creator->user->notifications()->where('type', 'payout_paid')->count());
        $this->assertSame(15000, (new Earnings($creator))->available());
    }

    public function test_rejected_requests_return_the_money_and_notify(): void
    {
        $creator = $this->creator('artist');
        $this->earn($creator, 50000, 10);
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($creator->user)->post('/studio/earnings/payout', ['amount' => 40000]);
        $this->assertSame(0, (new Earnings($creator))->available());

        $this->actingAs($admin)->post('/admin/payouts/'.Payout::sole()->id.'/decide', ['decision' => 'rejected', 'reference' => 'Account name mismatch']);
        $this->assertSame(40000, (new Earnings($creator))->available());
        $this->assertSame(1, $creator->user->notifications()->where('type', 'payout_rejected')->count());
    }

    public function test_statement_csv_and_access(): void
    {
        $creator = $this->creator('artist');
        $this->earn($creator, 50000, 10);

        $csv = $this->actingAs($creator->user)->get('/studio/earnings/statement.csv')->assertOk()->streamedContent();
        $this->assertStringContainsString('Gross (MNT)', $csv);
        $this->assertStringContainsString(',50000,10000,40000,', $csv);

        $this->actingAs(User::factory()->create())->get('/studio/earnings')->assertForbidden();
    }
}
