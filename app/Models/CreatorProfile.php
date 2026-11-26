<?php

namespace App\Models;

use App\Support\RegisterNumber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CreatorProfile extends Model
{
    public const PENDING = 'pending';

    public const APPROVED = 'approved';

    public const REJECTED = 'rejected';

    /** Taken down by moderators: page, posts and studio are hidden until reinstated. */
    public const SUSPENDED = 'suspended';

    protected $fillable = [
        'user_id', 'handle', 'display_name', 'bio', 'price_monthly', 'adult_content', 'dm_policy', 'bundles',
        'legal_name', 'register_number', 'id_front_path', 'id_back_path', 'selfie_path',
        'bank_name', 'bank_account', 'account_holder', 'consented_at', 'consent_ip',
        'status', 'review_note', 'reviewed_at', 'reviewed_by', 'trial_days',
    ];

    protected $casts = [
        'price_monthly' => 'integer',
        'bundles' => 'array',
        'adult_content' => 'boolean',
        'register_number' => 'encrypted',
        'bank_account' => 'encrypted',
        'consented_at' => 'datetime',
        'reviewed_at' => 'datetime',
    ];

    // Identity and payout details never leave the server except through the admin review screen.
    protected $hidden = [
        'legal_name', 'register_number', 'register_hash', 'id_front_path', 'id_back_path', 'selfie_path',
        'bank_name', 'bank_account', 'bank_account_hash', 'account_holder', 'consent_ip', 'reviewed_by',
    ];

    protected static function booted(): void
    {
        static::saving(function (CreatorProfile $p) {
            if ($p->isDirty('register_number')) {
                $p->register_hash = RegisterNumber::fingerprint($p->register_number);
            }
            if ($p->isDirty('bank_account')) {
                $p->bank_account_hash = hash_hmac('sha256', strtoupper(preg_replace('/[\s-]/', '', $p->bank_account)), (string) config('app.key'));
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isApproved(): bool
    {
        return $this->status === self::APPROVED;
    }

    public function followers(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(User::class, 'follows')->withTimestamps();
    }

    /** Approved creators the viewer may see listed: 18+ pages only for signed-in adults. */
    /** The creator's photo is their account's avatar. */
    public function avatarUrl(): ?string
    {
        return $this->user?->avatar_url;
    }

    public function coverUrl(): ?string
    {
        return $this->cover_path ? \Illuminate\Support\Facades\Storage::disk('public')->url($this->cover_path) : null;
    }

    public function scopeListableFor(\Illuminate\Database\Eloquent\Builder $q, ?User $viewer): \Illuminate\Database\Eloquent\Builder
    {
        return $q->where('status', self::APPROVED)->when(! $viewer, fn ($w) => $w->where('adult_content', false))
            ->with('user:id,avatar_path'); // cards show the avatar
    }

    /** What a creator card shows (public information only). */
    /** Discount (percent) for a bundle of $months, or null if the creator doesn't offer it. A month is always on offer. */
    public function bundleDiscount(int $months): ?int
    {
        if ($months === 1) {
            return 0;
        }
        if (! in_array($months, config('creators.bundle_months'), true)) {
            return null;
        }
        $discount = (int) ($this->bundles[(string) $months] ?? 0);

        return $discount > 0 ? $discount : null;
    }

    /** What $months cost at once, rounded down to whole hundreds of tögrög; null if not offered. */
    public function priceFor(int $months): ?int
    {
        $discount = $this->bundleDiscount($months);

        return $discount === null ? null : intdiv($this->price_monthly * $months * (100 - $discount), 100 * 100) * 100;
    }

    public function promoCodes(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PromoCode::class);
    }

    /** The free trial $fan can start (its length in days), or null: only for fans who never subscribed before. */
    public function trialFor(?User $fan): ?int
    {
        if (! $this->trial_days || ! $fan || $fan->id === $this->user_id) {
            return null;
        }
        $had = Subscription::where('user_id', $fan->id)->where('creator_profile_id', $this->id)->exists()
            || \Illuminate\Support\Facades\DB::table('subscription_trials')->where('user_id', $fan->id)->where('creator_profile_id', $this->id)->exists();

        return $had ? null : $this->trial_days;
    }

    /** The plain month plus every bundle on offer: [{months, discount, price}]. */
    public function subscriptionOptions(): array
    {
        return collect([1, ...config('creators.bundle_months')])
            ->filter(fn ($m) => $this->bundleDiscount($m) !== null)
            ->map(fn ($m) => ['months' => $m, 'discount' => $this->bundleDiscount($m), 'price' => $this->priceFor($m)])
            ->values()->all();
    }

    public function toCard(?User $viewer = null): array
    {
        return [
            ...$this->only('handle', 'display_name', 'bio', 'price_monthly', 'adult_content'),
            'avatar_url' => $this->avatarUrl(),
            'cover_url' => $this->coverUrl(),
            'posts_count' => (int) ($this->posts_count ?? $this->posts()->count()),
            'followers_count' => (int) ($this->followers_count ?? $this->followers()->count()),
            'following' => $viewer ? $this->followers()->whereKey($viewer->id)->exists() : false,
        ];
    }

    public function posts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Post::class)->latest()->latest('id'); // newest first, stable within the same second
    }

    public function starterPost(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(Post::class)->ofMany(
            ['created_at' => 'max', 'id' => 'max'],
            fn ($query) => $query->published()->where('visibility', Post::PUBLIC)->where('is_adult', false)
                ->where(fn ($price) => $price->whereNull('price')->orWhere('price', 0)),
        );
    }

    /** Whether $viewer has a paid subscription to this creator that hasn't expired. */
    public function hasActiveSubscriber(?User $viewer): bool
    {
        return $viewer !== null && $this->subscriptions()->active()->where('user_id', $viewer->id)->exists();
    }

    public function subscriptions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function payouts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Payout::class);
    }

    public function payments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
