<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A fan's paid access to one creator, valid until expires_at. */
class Subscription extends Model
{
    protected $fillable = ['user_id', 'creator_profile_id', 'expires_at'];

    protected $casts = ['expires_at' => 'datetime'];

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('expires_at', '>', now());
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(CreatorProfile::class, 'creator_profile_id');
    }
}
