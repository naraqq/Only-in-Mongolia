<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A photo or video in a message. Private disk; only the two people in the conversation can open it. */
class MessageMedia extends Model
{
    protected $table = 'message_media';

    protected $fillable = ['message_id', 'type', 'path', 'mime', 'position', 'sha256', 'scan_status'];

    protected $casts = ['scan_labels' => 'array'];

    protected $hidden = ['path'];

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }
}
