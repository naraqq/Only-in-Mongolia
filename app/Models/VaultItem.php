<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One photo or video in a creator's media library (see App\Media\Library). */
class VaultItem extends Model
{
    protected $fillable = ['creator_profile_id', 'type', 'path', 'mime', 'sha256'];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(CreatorProfile::class, 'creator_profile_id');
    }
}
