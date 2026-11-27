<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A file sent in pieces (see App\Media\ChunkedUploads), waiting to be attached to a post. */
class MediaUpload extends Model
{
    use HasUlids;

    protected $fillable = ['user_id', 'name', 'size', 'chunk_size', 'chunks', 'type', 'mime', 'path', 'sha256', 'completed_at', 'attached_at'];

    protected function casts(): array
    {
        return ['size' => 'integer', 'chunk_size' => 'integer', 'chunks' => 'integer', 'completed_at' => 'datetime', 'attached_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
