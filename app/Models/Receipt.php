<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A company's receipt for one payment (App\Billing\Receipts), optionally registered with e-barimt. */
class Receipt extends Model
{
    public const EB_NONE = 'none';

    public const EB_PENDING = 'pending';

    public const EB_ISSUED = 'issued';

    public const EB_FAILED = 'failed';

    public const EB_RETURNED = 'returned';

    protected $fillable = [
        'payment_id', 'company_id', 'number', 'year', 'sequence', 'buyer_name', 'buyer_register', 'buyer_email',
        'description', 'quantity', 'total', 'vat', 'vat_percent', 'issued_at',
        'ebarimt_status', 'ebarimt_id', 'ebarimt_qr', 'ebarimt_lottery', 'ebarimt_date', 'ebarimt_error',
    ];

    protected $casts = [
        'issued_at' => 'datetime', 'ebarimt_date' => 'datetime',
        'total' => 'integer', 'vat' => 'integer', 'vat_percent' => 'integer', 'quantity' => 'integer',
    ];

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /** The price without VAT. */
    public function net(): int
    {
        return $this->total - $this->vat;
    }
}
