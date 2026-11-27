<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * A sponsored banner (a picture or a short video) from another company (see App\Http\Controllers\AdController).
 * Admins add banners directly; companies buy them themselves (App\Http\Controllers\BusinessController): a company's
 * campaign is paid up front, then an admin approves it (or rejects it, and the payment is refunded).
 */
class Ad extends Model
{
    /** A company's campaign that isn't paid for yet. */
    public const UNPAID = 'unpaid';

    /** Paid, waiting for an admin. */
    public const PENDING = 'pending';

    public const APPROVED = 'approved';

    public const REJECTED = 'rejected';

    /** Where a banner can show. */
    public const PLACEMENTS = ['all', 'feed', 'creators'];

    /** The daily limits offered per viewer (null = no limit). */
    public const FREQUENCY_CAPS = [1, 2, 3, 5];

    protected $fillable = [
        'company_id', 'advertiser', 'title', 'body', 'image_path', 'video_path', 'poster_path', 'url', 'starts_on', 'ends_on',
        'active', 'weight', 'allow_adult', 'placement', 'frequency_cap', 'created_by', 'review_status', 'reject_reason', 'reviewed_by', 'reviewed_at', 'submitted_at', 'price',
    ];

    protected $casts = [
        'starts_on' => 'date', 'ends_on' => 'date', 'active' => 'boolean', 'allow_adult' => 'boolean', 'weight' => 'integer', 'frequency_cap' => 'integer',
        'reviewed_at' => 'datetime', 'submitted_at' => 'datetime', 'price' => 'integer',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /** Running today: approved, switched on, started, not ended. */
    public function scopeLive(Builder $q): Builder
    {
        $today = now()->toDateString();

        return $q->where('review_status', self::APPROVED)->where('active', true)->where('starts_on', '<=', $today)
            ->where(fn ($w) => $w->whereNull('ends_on')->orWhere('ends_on', '>=', $today));
    }

    /** Running banners that may show on $place ('feed' or 'creators'), on an 18+ page or not. */
    public function scopeFor(Builder $q, string $place, bool $adult): Builder
    {
        return $q->live()->whereIn('placement', ['all', $place])->when($adult, fn ($q) => $q->where('allow_adult', true));
    }

    /** unpaid | review | rejected | running | scheduled | ended | paused */
    public function status(): string
    {
        return match (true) {
            $this->review_status === self::UNPAID => 'unpaid',
            $this->review_status === self::PENDING => 'review',
            $this->review_status === self::REJECTED => 'rejected',
            ! $this->active => 'paused',
            $this->starts_on->isFuture() => 'scheduled',
            $this->ends_on !== null && $this->ends_on->endOfDay()->isPast() => 'ended',
            default => 'running',
        };
    }

    /** How many days a campaign from $start to $end (both included) runs. */
    public static function days(Carbon|string $start, Carbon|string $end): int
    {
        return (int) Carbon::parse($start)->startOfDay()->diffInDays(Carbon::parse($end)->startOfDay()) + 1;
    }

    /** What a company pays for $days days. */
    public static function priceFor(int $days): int
    {
        return $days * (int) config('ads.daily_price');
    }

    public function isVideo(): bool
    {
        return (bool) $this->video_path;
    }

    public function imageUrl(): ?string
    {
        return $this->image_path ? Storage::disk('public')->url($this->image_path) : null;
    }

    public function videoUrl(): ?string
    {
        return $this->video_path ? Storage::disk('public')->url($this->video_path) : null;
    }

    /** The picture shown for the banner: its image, or the video's still. */
    public function posterUrl(): ?string
    {
        return $this->poster_path ? Storage::disk('public')->url($this->poster_path) : $this->imageUrl();
    }

    /** Remove the banner's files (when it's deleted, or its picture/video is replaced). */
    public function deleteFiles(): void
    {
        Storage::disk('public')->delete(array_values(array_filter([$this->image_path, $this->video_path, $this->poster_path])));
    }

    /**
     * The advertiser's link with our tags, so their analytics show the visits came from here
     * (their own utm_* values win).
     */
    public function trackedUrl(): string
    {
        $parts = parse_url($this->url);
        parse_str($parts['query'] ?? '', $query);
        $query += ['utm_source' => 'onlyinmongolia', 'utm_medium' => $this->isVideo() ? 'video' : 'banner', 'utm_campaign' => 'ad-'.$this->id];
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

    /** Views and clicks per banner, since $since (all time when null). @return \Illuminate\Support\Collection<int, object> */
    public static function totals(array $ids, ?string $since = null)
    {
        return DB::table('ad_stats')->whereIn('ad_id', $ids)->when($since, fn ($q) => $q->where('day', '>=', $since))
            ->groupBy('ad_id')->selectRaw('ad_id, sum(impressions) as impressions, sum(clicks) as clicks')->get()->keyBy('ad_id');
    }

    /** Day-by-day views and clicks as a CSV, for the advertiser. */
    public function report(): StreamedResponse
    {
        $rows = DB::table('ad_stats')->where('ad_id', $this->id)->orderBy('day')->get();
        $name = 'sponsored-'.$this->id.'-'.str($this->advertiser)->slug().'.csv';

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Advertiser', $this->advertiser]);
            fputcsv($out, ['Banner', $this->title]);
            fputcsv($out, []);
            fputcsv($out, ['Day', 'Views', 'Clicks', 'Click rate %']);
            foreach ($rows as $r) {
                fputcsv($out, [$r->day, $r->impressions, $r->clicks, $r->impressions ? round($r->clicks / $r->impressions * 100, 2) : 0]);
            }
            fputcsv($out, ['Total', $rows->sum('impressions'), $rows->sum('clicks'), $rows->sum('impressions') ? round($rows->sum('clicks') / $rows->sum('impressions') * 100, 2) : 0]);
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv']);
    }
}
