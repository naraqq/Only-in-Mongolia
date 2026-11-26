<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** A creator's own group of fans (e.g. "VIP"), used to aim mass messages. */
class FanList extends Model
{
    protected $fillable = ['creator_profile_id', 'name'];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(CreatorProfile::class, 'creator_profile_id');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'fan_list_members')->withPivot('created_at');
    }
}
