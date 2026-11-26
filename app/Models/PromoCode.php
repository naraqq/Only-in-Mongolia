<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A creator's discount code: percent off one subscription purchase, once per fan. */
class PromoCode extends Model
{
    protected $fillable = ['creator_profile_id', 'code', 'percent_off', 'max_uses', 'uses', 'expires_at', 'active'];

    protected $casts = ['expires_at' => 'datetime', 'active' => 'boolean', 'percent_off' => 'integer', 'max_uses' => 'integer', 'uses' => 'integer'];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(CreatorProfile::class, 'creator_profile_id');
    }

    public static function normalize(string $code): string
    {
        return mb_strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code));
    }

    /** Why this code can't be used by $fan right now, or null when it can. */
    public function whyNot(User $fan): ?string
    {
        return match (true) {
            ! $this->active => 'inactive',
            $this->expires_at && $this->expires_at->isPast() => 'expired',
            $this->max_uses !== null && $this->uses >= $this->max_uses => 'used_up',
            Payment::where('user_id', $fan->id)->where('promo_code_id', $this->id)->where('status', Payment::PAID)->exists() => 'already_used',
            default => null,
        };
    }

    /** $price with the code applied, rounded down to ₮100 like bundle prices. */
    public function apply(int $price): int
    {
        return intdiv($price * (100 - $this->percent_off), 100 * 100) * 100;
    }
}
