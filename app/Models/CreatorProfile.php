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
        'user_id', 'handle', 'display_name', 'bio', 'price_monthly', 'adult_content', 'dm_policy',
        'legal_name', 'register_number', 'id_front_path', 'id_back_path', 'selfie_path',
        'bank_name', 'bank_account', 'account_holder', 'consented_at', 'consent_ip',
        'status', 'review_note', 'reviewed_at', 'reviewed_by',
    ];

    protected $casts = [
        'price_monthly' => 'integer',
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
