<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payout extends Model
{
    public const REQUESTED = 'requested';

    public const PAID = 'paid';

    public const REJECTED = 'rejected';

    protected $fillable = ['creator_profile_id', 'amount', 'status', 'bank_name', 'bank_account', 'account_holder', 'reference', 'processed_at', 'processed_by'];

    protected $casts = ['amount' => 'integer', 'bank_account' => 'encrypted', 'processed_at' => 'datetime'];

    protected $hidden = ['bank_account'];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(CreatorProfile::class, 'creator_profile_id');
    }
}
