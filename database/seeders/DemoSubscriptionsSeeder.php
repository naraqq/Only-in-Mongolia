<?php

namespace Database\Seeders;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Demo subscriptions on top of DemoSeeder's data: Demo Fan (99999999) subscribes to @saraa.art and @gobi.lens,
 * and @demo gets a few paying subscribers so the studio shows earnings. Safe to run again.
 */
class DemoSubscriptionsSeeder extends Seeder
{
    public function run(): void
    {
        $fan = User::where('phone', '99999999')->first();
        $demo = CreatorProfile::where('handle', 'demo')->first();
        if (! $fan || ! $demo) {
            return;
        }

        foreach (CreatorProfile::whereIn('handle', ['saraa.art', 'gobi.lens'])->get() as $creator) {
            $this->paid($fan, $creator, daysAgo: 3);
        }

        $others = User::whereNull('phone')->whereDoesntHave('creatorProfile')->take(4)->get();
        foreach ($others as $i => $user) {
            $this->paid($user, $demo, daysAgo: $i * 4);
        }
    }

    private function paid(User $user, CreatorProfile $creator, int $daysAgo): void
    {
        if ($creator->subscriptions()->where('user_id', $user->id)->exists()) {
            return;
        }
        $paidAt = now()->subDays($daysAgo);
        Payment::create([
            'user_id' => $user->id, 'creator_profile_id' => $creator->id, 'purpose' => 'subscription',
            'amount' => $creator->price_monthly,
            'platform_fee' => intdiv($creator->price_monthly * (int) config('creators.platform_fee_percent'), 100),
            'status' => Payment::PAID, 'provider' => 'fake', 'invoice_id' => 'DEMO', 'paid_at' => $paidAt,
        ]);
        $creator->subscriptions()->create(['user_id' => $user->id, 'expires_at' => $paidAt->copy()->addDays((int) config('creators.subscription_days'))]);
    }
}
