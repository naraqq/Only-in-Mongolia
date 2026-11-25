<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_admins_see_the_dashboard_with_the_right_numbers(): void
    {
        $creator = User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
        $fan = User::factory()->create();
        foreach ([['subscription', 10000], ['tip', 5000], ['tip', 3000]] as [$purpose, $amount]) {
            Payment::create(['user_id' => $fan->id, 'creator_profile_id' => $creator->id, 'purpose' => $purpose, 'amount' => $amount,
                'platform_fee' => intdiv($amount * 20, 100), 'status' => Payment::PAID, 'provider' => 'fake', 'invoice_id' => 'x', 'paid_at' => now()]);
        }
        Payment::create(['user_id' => $fan->id, 'creator_profile_id' => $creator->id, 'amount' => 99999, 'platform_fee' => 0, 'status' => 'pending', 'provider' => 'fake']);
        Report::create(['reporter_id' => $fan->id, 'reportable_type' => CreatorProfile::class, 'reportable_id' => $creator->id, 'reason' => 'minor']);
        $admin = User::factory()->create(['is_admin' => true]);

        $this->actingAs($fan)->get('/admin')->assertForbidden();
        $this->actingAs($admin)->get('/admin')->assertInertia(fn ($p) => $p
            ->component('admin/dashboard')
            ->where('kpis.gmvMonth', 18000)
            ->where('kpis.feeMonth', 3600)
            ->where('kpis.creators', 1)
            ->where('kpis.users', 3)
            ->where('todo.reports', 1)
            ->where('todo.urgentReports', 1)
            ->where('byPurpose.tip.total', 8000)
            ->where('byPurpose.tip.count', 2)
            ->has('revenue', 30)
            ->where('revenue.29.value', 18000)
            ->where('topCreators.0.handle', 'artist')
            ->has('recentPayments', 3)
            ->where('adminCounts.reports', 1));
    }
}
