<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One thing an admin did, for the audit log. Never edited or deleted from the app. */
class AdminAction extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['admin_id', 'action', 'subject_type', 'subject_id', 'data', 'ok', 'ip'];

    protected $casts = ['data' => 'array', 'ok' => 'boolean', 'created_at' => 'datetime'];

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}
