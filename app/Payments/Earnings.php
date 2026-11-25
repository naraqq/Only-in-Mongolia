<?php

namespace App\Payments;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Payout;
use Illuminate\Support\Carbon;

/**
 * A creator's money, worked out from the payments themselves (nothing is stored twice):
 * - earned: every paid payment minus the platform fee;
 * - on hold: earnings younger than the holding period (room for fraud checks and bank reversals);
 * - available: earned and past the hold, minus payouts that are requested or paid (rejected ones come back).
 */
class Earnings
{
    public function __construct(public readonly CreatorProfile $creator) {}

    public static function holdDays(): int
    {
        return (int) config('creators.payout_hold_days');
    }

    private function net(?Carbon $paidBefore = null): int
    {
        $q = $this->creator->payments()->where('status', Payment::PAID)
            ->when($paidBefore, fn ($w) => $w->where('paid_at', '<=', $paidBefore));

        return (int) (clone $q)->sum('amount') - (int) (clone $q)->sum('platform_fee');
    }

    public function earned(): int
    {
        return $this->net();
    }

    public function cleared(): int
    {
        return $this->net(now()->subDays(self::holdDays()));
    }

    public function onHold(): int
    {
        return $this->earned() - $this->cleared();
    }

    public function paidOut(): int
    {
        return (int) $this->creator->payouts()->where('status', Payout::PAID)->sum('amount');
    }

    public function requested(): int
    {
        return (int) $this->creator->payouts()->where('status', Payout::REQUESTED)->sum('amount');
    }

    public function available(): int
    {
        return max(0, $this->cleared() - $this->paidOut() - $this->requested());
    }

    /** When the oldest earnings still on hold become available, if any. */
    public function nextRelease(): ?Carbon
    {
        $oldest = $this->creator->payments()->where('status', Payment::PAID)
            ->where('paid_at', '>', now()->subDays(self::holdDays()))->min('paid_at');

        return $oldest ? Carbon::parse($oldest)->addDays(self::holdDays()) : null;
    }
}
