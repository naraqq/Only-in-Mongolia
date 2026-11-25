<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Blocking. If either person blocked the other they can't message each other; a creator who blocked a fan
 * is invisible to that fan (page, follow, subscribe, tip, buy).
 */
class Blocking
{
    public static function between(?User $a, ?User $b): bool
    {
        if (! $a || ! $b || $a->id === $b->id) {
            return false;
        }

        return DB::table('blocks')
            ->where(fn ($q) => $q->where('blocker_id', $a->id)->where('blocked_id', $b->id))
            ->orWhere(fn ($q) => $q->where('blocker_id', $b->id)->where('blocked_id', $a->id))
            ->exists();
    }

    public static function hasBlocked(?User $blocker, ?User $blocked): bool
    {
        return $blocker && $blocked && DB::table('blocks')->where('blocker_id', $blocker->id)->where('blocked_id', $blocked->id)->exists();
    }

    /** Ids of everyone $user blocked or was blocked by (for filtering lists). */
    public static function idsAround(User $user): array
    {
        return DB::table('blocks')->where('blocker_id', $user->id)->pluck('blocked_id')
            ->merge(DB::table('blocks')->where('blocked_id', $user->id)->pluck('blocker_id'))->unique()->values()->all();
    }
}
