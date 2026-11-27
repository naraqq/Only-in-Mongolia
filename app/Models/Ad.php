<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/** A sponsored banner from another company (see App\Http\Controllers\AdController). */
class Ad extends Model
{
    protected $fillable = ['advertiser', 'title', 'body', 'image_path', 'url', 'starts_on', 'ends_on', 'active', 'weight', 'allow_adult', 'created_by'];

    protected $casts = ['starts_on' => 'date', 'ends_on' => 'date', 'active' => 'boolean', 'allow_adult' => 'boolean', 'weight' => 'integer'];

    /** Running today: switched on, started, not ended. */
    public function scopeLive(Builder $q): Builder
    {
        $today = now()->toDateString();

        return $q->where('active', true)->where('starts_on', '<=', $today)
            ->where(fn ($w) => $w->whereNull('ends_on')->orWhere('ends_on', '>=', $today));
    }

    /** running | scheduled | ended | paused */
    public function status(): string
    {
        return match (true) {
            ! $this->active => 'paused',
            $this->starts_on->isFuture() => 'scheduled',
            $this->ends_on !== null && $this->ends_on->endOfDay()->isPast() => 'ended',
            default => 'running',
        };
    }

    public function imageUrl(): string
    {
        return Storage::disk('public')->url($this->image_path);
    }

    /**
     * The advertiser's link with our tags, so their analytics show the visits came from here
     * (their own utm_* values win).
     */
    public function trackedUrl(): string
    {
        $parts = parse_url($this->url);
        parse_str($parts['query'] ?? '', $query);
        $query += ['utm_source' => 'onlyinmongolia', 'utm_medium' => 'banner', 'utm_campaign' => 'ad-'.$this->id];
        $base = preg_replace('/[?#].*$/', '', $this->url);

        return $base.'?'.http_build_query($query).(isset($parts['fragment']) ? '#'.$parts['fragment'] : '');
    }

    /** Add views or clicks for today. */
    public static function tally(array $ids, string $column): void
    {
        $day = now()->toDateString();
        $rows = array_map(fn ($id) => ['ad_id' => $id, 'day' => $day, 'impressions' => $column === 'impressions' ? 1 : 0, 'clicks' => $column === 'clicks' ? 1 : 0], $ids);
        if ($rows) {
            DB::table('ad_stats')->upsert($rows, ['ad_id', 'day'], [$column => DB::raw($column.' + 1')]);
        }
    }
}
