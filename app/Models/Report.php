<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Report extends Model
{
    public const REASONS = ['minor', 'nonconsensual', 'illegal', 'harassment', 'spam', 'copyright', 'other'];

    /** Reviewed first: possible child abuse material or content shared without consent. */
    public const URGENT = ['minor', 'nonconsensual'];

    /** What can be reported from inside the app, by short name. */
    public const TYPES = ['post' => Post::class, 'comment' => PostComment::class, 'creator' => CreatorProfile::class, 'message' => Message::class];

    protected $fillable = ['reporter_id', 'reportable_type', 'reportable_id', 'reason', 'details', 'contact_name', 'contact_email', 'url', 'status', 'resolution', 'resolved_by', 'resolved_at'];

    protected $casts = ['resolved_at' => 'datetime'];

    public function reportable(): MorphTo
    {
        return $this->morphTo();
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_id');
    }

    public function isUrgent(): bool
    {
        return in_array($this->reason, self::URGENT, true);
    }
}
