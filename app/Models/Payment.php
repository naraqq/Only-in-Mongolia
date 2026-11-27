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

    public const REFUNDED = 'refunded';

    public const SUBSCRIPTION = 'subscription';

    public const TIP = 'tip';

    public const PPV = 'ppv';

    /** Money added to the fan's own wallet (no creator). */
    public const TOPUP = 'topup';

    /** A company paying for a sponsored banner (no creator; all of it is the platform's). */
    public const AD = 'ad';

    /** What fans pay creators for: everything except wallet top-ups and companies' banners. */
    public const SALES = [self::SUBSCRIPTION, self::TIP, self::PPV];

    protected $fillable = ['user_id', 'creator_profile_id', 'purpose', 'post_id', 'message_id', 'note', 'amount', 'platform_fee', 'status', 'provider', 'invoice_id', 'qr_text', 'qr_image', 'bank_links', 'paid_at', 'refunded_at', 'refunded_by', 'refund_reason', 'months', 'promo_code_id', 'discount', 'source', 'source_id', 'referrer', 'ad_id'];

    protected $casts = ['bank_links' => 'array', 'paid_at' => 'datetime', 'refunded_at' => 'datetime', 'months' => 'integer', 'renewal' => 'boolean'];

    protected $hidden = ['qr_image', 'qr_text'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
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
