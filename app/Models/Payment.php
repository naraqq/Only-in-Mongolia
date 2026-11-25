<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One QPay invoice. Its ULID is the public id in URLs and the invoice's sender number. */
class Payment extends Model
{
    use HasUlids;

    public const PENDING = 'pending';

    public const PAID = 'paid';

    protected $fillable = ['user_id', 'creator_profile_id', 'purpose', 'amount', 'platform_fee', 'status', 'provider', 'invoice_id', 'qr_text', 'qr_image', 'bank_links', 'paid_at'];

    protected $casts = ['bank_links' => 'array', 'paid_at' => 'datetime'];

    protected $hidden = ['qr_image', 'qr_text'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(CreatorProfile::class, 'creator_profile_id');
    }

    public function isPaid(): bool
    {
        return $this->status === self::PAID;
    }
}
