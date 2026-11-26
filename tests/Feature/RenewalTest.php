<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\User;
use App\Payments\Wallet;
use App\Models\WalletEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RenewalTest extends TestCase
{
    use RefreshDatabase;

    private function setup2(int $balance, int $hoursLeft = 10, bool $auto = true): array
    {
        $creator = User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        if ($balance) {
            Wallet::credit($fan, $balance, WalletEntry::TOPUP);
        }
        $sub = $fan->subscriptions()->create(['creator_profile_id' => $creator->id, 'expires_at' => now()->addHours($hoursLeft), 'auto_renew' => $auto]);

        return [$creator, $fan, $sub];
    }

    public function test_auto_renew_pays_from_the_wallet_in_the_last_day_only_once(): void
    {
        [, $fan, $sub] = $this->setup2(25000);
        $before = $sub->expires_at;

        $this->artisan('subscriptions:renew')->expectsOutputToContain('Renewed 1')->assertSuccessful();
        $this->assertSame(15000, $fan->fresh()->wallet_balance);
        $this->assertTrue($sub->fresh()->expires_at->gt($before->copy()->addDays(29)));
        $this->assertSame('wallet', Payment::sole()->provider);
        $this->assertSame(1, DB::table('notifications')->where('notifiable_id', $fan->id)->where('type', 'auto_renewed')->count());

        // Now a month away: the next hourly run leaves it alone.
        $this->artisan('subscriptions:renew')->expectsOutputToContain('Renewed 0');
        $this->assertSame(1, Payment::count());
    }

    public function test_short_wallet_warns_once_and_charges_nothing(): void
    {
        [, $fan] = $this->setup2(3000);
        $this->artisan('subscriptions:renew')->expectsOutputToContain('short of money 1');
        $this->artisan('subscriptions:renew');
        $this->assertSame(0, Payment::count());
        $this->assertSame(3000, $fan->fresh()->wallet_balance);
        $this->assertSame(1, DB::table('notifications')->where('notifiable_id', $fan->id)->where('type', 'renew_failed')->count());
    }

    public function test_not_renewed_when_off_far_from_the_end_or_the_creator_is_suspended(): void
    {
        [$creator, $fan, $sub] = $this->setup2(50000, hoursLeft: 72);
        $this->artisan('subscriptions:renew')->expectsOutputToContain('Renewed 0'); // too early

        $sub->update(['expires_at' => now()->addHours(5), 'auto_renew' => false]);
        $this->artisan('subscriptions:renew')->expectsOutputToContain('Renewed 0'); // switched off

        $sub->update(['auto_renew' => true]);
        $creator->update(['status' => CreatorProfile::SUSPENDED]);
        $this->artisan('subscriptions:renew')->expectsOutputToContain('stopped 1');
        $this->assertFalse($sub->fresh()->auto_renew);
        $this->assertSame(50000, $fan->fresh()->wallet_balance);
    }

    public function test_fans_switch_auto_renew_and_renew_in_one_tap(): void
    {
        [, $fan, $sub] = $this->setup2(15000, auto: false);
        $this->actingAs($fan)->post('/wallet/auto-renew/artist', ['on' => true])->assertSessionHas('status', 'auto-renew-on');
        $this->assertTrue($sub->fresh()->auto_renew);
        $this->get('/wallet')->assertInertia(fn ($p) => $p->where('subscriptions.0.auto_renew', true));

        $this->post('/wallet/renew/artist')->assertSessionHas('status', 'renewed');
        $this->assertSame(5000, $fan->fresh()->wallet_balance);
        $this->post('/wallet/renew/artist')->assertSessionHasErrors('payment'); // only 5000 left

        $other = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($other)->post('/wallet/renew/artist')->assertNotFound(); // not their subscription
    }
}
