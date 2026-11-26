<?php

namespace App\Fans;

use App\Models\CreatorProfile;
use App\Models\FanList;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Who a creator can aim a mass message at. Built-in groups update by themselves; custom lists are the creator's own.
 *
 *   subscribers  active subscribers
 *   followers    people who follow the page
 *   new          subscribed in the last 7 days (and still active)
 *   expired      subscribed before, not any more
 *   top          the 50 biggest spenders (subscriptions, tips, unlocks)
 *   list:{id}    one of the creator's lists
 */
class Audience
{
    public const BUILT_IN = ['subscribers', 'followers', 'new', 'expired', 'top'];

    public const TOP = 50;

    public static function valid(CreatorProfile $creator, string $audience): bool
    {
        if (in_array($audience, self::BUILT_IN, true)) {
            return true;
        }

        return (bool) preg_match('/^list:(\d+)$/', $audience, $m)
            && FanList::where('creator_profile_id', $creator->id)->whereKey((int) $m[1])->exists();
    }

    /** The people in an audience (never the creator), as a User query. */
    public static function query(CreatorProfile $creator, string $audience): Builder
    {
        $subs = fn () => DB::table('subscriptions')->where('creator_profile_id', $creator->id);

        $query = match (true) {
            $audience === 'subscribers' => User::whereIn('id', $subs()->where('expires_at', '>', now())->select('user_id')),
            $audience === 'followers' => User::whereIn('id', DB::table('follows')->where('creator_profile_id', $creator->id)->select('user_id')),
            $audience === 'new' => User::whereIn('id', $subs()->where('expires_at', '>', now())->where('created_at', '>=', now()->subDays(7))->select('user_id')),
            $audience === 'expired' => User::whereIn('id', $subs()->where('expires_at', '<=', now())->select('user_id')),
            $audience === 'top' => User::whereIn('id', self::topSpenders($creator)),
            str_starts_with($audience, 'list:') => User::whereIn('id', DB::table('fan_list_members')
                ->join('fan_lists', 'fan_lists.id', '=', 'fan_list_members.fan_list_id')
                ->where('fan_lists.creator_profile_id', $creator->id)->where('fan_lists.id', (int) substr($audience, 5))
                ->select('fan_list_members.user_id')),
            default => User::whereRaw('1 = 0'),
        };

        return $query->where('users.id', '!=', $creator->user_id);
    }

    /** @return array<string, int> how many people each built-in group and list has */
    public static function counts(CreatorProfile $creator): array
    {
        $counts = [];
        foreach (self::BUILT_IN as $a) {
            $counts[$a] = self::query($creator, $a)->count();
        }
        foreach (FanList::where('creator_profile_id', $creator->id)->withCount('members')->get() as $list) {
            $counts['list:'.$list->id] = $list->members_count;
        }

        return $counts;
    }

    /** @return list<int> */
    public static function topSpenders(CreatorProfile $creator): array
    {
        return self::spending($creator)->orderByDesc('total')->limit(self::TOP)->pluck('user_id')->all();
    }

    /** @param list<int> $userIds @return array<int, int> ₮ each person has paid this creator */
    public static function spentBy(CreatorProfile $creator, array $userIds): array
    {
        return self::spending($creator)->whereIn('user_id', $userIds)->pluck('total', 'user_id')->map(fn ($v) => (int) $v)->all();
    }

    private static function spending(CreatorProfile $creator): \Illuminate\Database\Query\Builder
    {
        return DB::table('payments')->where('creator_profile_id', $creator->id)->where('status', Payment::PAID)
            ->whereIn('purpose', Payment::SALES)->where('user_id', '!=', $creator->user_id)
            ->groupBy('user_id')->selectRaw('user_id, sum(amount) as total');
    }
}
