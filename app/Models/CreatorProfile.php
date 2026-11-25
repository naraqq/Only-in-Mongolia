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

    protected $fillable = [
        'user_id', 'handle', 'display_name', 'bio', 'price_monthly', 'adult_content',
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
}
