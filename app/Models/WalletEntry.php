<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One change to a fan's wallet balance. Written once, never changed. */
class WalletEntry extends Model
{
    public const TOPUP = 'topup';

    public const SPEND = 'spend';

    public const REFUND = 'refund';

    /** Money taken back out, e.g. when a top-up itself is refunded. */
    public const REVERSAL = 'reversal';

    protected $fillable = ['user_id', 'type', 'amount', 'balance_after', 'payment_id', 'note'];

    protected $casts = ['amount' => 'integer', 'balance_after' => 'integer'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
