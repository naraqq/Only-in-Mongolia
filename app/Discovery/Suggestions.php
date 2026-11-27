<?php

namespace App\Discovery;

use App\Models\CreatorProfile;
use App\Models\User;
use App\Support\Blocking;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Creators to suggest to someone, best first:
 *  1. followed by the people who follow the same creators as them ("fans of X also follow Y");
 *  2. about the same things (categories) as the creators they follow;
 *  3. then whoever is trending right now (also all a guest or a brand-new account gets).
 * Never themselves, anyone they follow, anyone blocked either way, or 18+ pages for guests. Kept for ten minutes.
 */
class Suggestions
{
    /** @return Collection<int, CreatorProfile> */
    public static function for(?User $viewer, int $limit = 5): Collection
    {
        $ids = $viewer
            ? Cache::remember("suggestions:{$viewer->id}:{$limit}", 600, fn () => self::ids($viewer, $limit))
            : Cache::remember("suggestions:guest:{$limit}", 600, fn () => self::trending(null, [], $limit));

        $creators = CreatorProfile::listableFor($viewer)->whereIn('id', $ids)->withCount(['posts', 'followers'])->get()->keyBy('id');

        // Followed or blocked since they were worked out: left out until the list is made again.
        $skip = $viewer ? self::excluded($viewer) : collect();

        return collect($ids)->map(fn ($id) => $creators[$id] ?? null)->filter()
            ->reject(fn (CreatorProfile $c) => $skip->contains($c->id))->values();
    }

    /** @return list<int> */
    private static function ids(User $viewer, int $limit): array
    {
        $exclude = self::excluded($viewer)->all();
        $following = $viewer->following()->pluck('creator_profiles.id');
        $picked = [];

        if ($following->isNotEmpty()) {
            // 1. Fans of the creators they follow: what else do those fans follow, most often?
            $picked = DB::table('follows as mine')
                ->join('follows as theirs', 'theirs.user_id', '=', 'mine.user_id')
                ->whereIn('mine.creator_profile_id', $following)
                ->where('mine.user_id', '!=', $viewer->id)
                ->whereNotIn('theirs.creator_profile_id', $exclude)
                ->groupBy('theirs.creator_profile_id')
                ->orderByRaw('count(*) desc')
                ->limit($limit * 3)
                ->pluck('theirs.creator_profile_id')->map(fn ($id) => (int) $id)->all();
            $picked = self::listable($viewer, $picked);

            // 2. Same topics as what they follow, the most active first.
            if (count($picked) < $limit) {
                $categories = CreatorProfile::whereIn('id', $following)->pluck('categories')->flatten()->filter()->unique()->values();
                if ($categories->isNotEmpty()) {
                    $picked = [...$picked, ...self::base($viewer)
                        ->whereNotIn('creator_profiles.id', [...$exclude, ...$picked])
                        ->where(fn (Builder $q) => $categories->each(fn ($c) => $q->orWhereJsonContains('categories', $c)))
                        ->trending()->limit($limit)->pluck('creator_profiles.id')->map(fn ($id) => (int) $id)->all()];
                }
            }
        }

        // 3. Whoever is trending.
        if (count($picked) < $limit) {
            $picked = [...$picked, ...self::trending($viewer, [...$exclude, ...$picked], $limit - count($picked))];
        }

        return array_slice(array_values(array_unique($picked)), 0, $limit);
    }

    /** @return list<int> */
    private static function trending(?User $viewer, array $exclude, int $limit): array
    {
        return self::base($viewer)->whereNotIn('creator_profiles.id', $exclude ?: [0])->trending()
            ->orderByDesc('reviewed_at')->limit($limit)->pluck('creator_profiles.id')->map(fn ($id) => (int) $id)->all();
    }

    private static function base(?User $viewer): Builder
    {
        return CreatorProfile::listableFor($viewer)->when($viewer, fn ($q) => $q->where('user_id', '!=', $viewer->id));
    }

    /** Only the ones this person may see listed, in the same order. @return list<int> */
    private static function listable(User $viewer, array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $ok = self::base($viewer)->whereIn('id', $ids)->pluck('id')->map(fn ($id) => (int) $id)->all();

        return array_values(array_filter($ids, fn ($id) => in_array($id, $ok, true)));
    }

    /** Their own page, pages they follow, and pages of anyone blocked either way. @return Collection<int, int> */
    private static function excluded(User $viewer): Collection
    {
        return $viewer->following()->pluck('creator_profiles.id')
            ->merge(CreatorProfile::where('user_id', $viewer->id)->pluck('id'))
            ->merge(CreatorProfile::whereIn('user_id', Blocking::idsAround($viewer))->pluck('id'))
            ->map(fn ($id) => (int) $id)->unique()->values();
    }
}
