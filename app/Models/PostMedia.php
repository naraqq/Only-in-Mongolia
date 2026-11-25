<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PostMedia extends Model
{
    protected $table = 'post_media';

    protected $fillable = ['post_id', 'type', 'path', 'mime', 'position'];

    protected $hidden = ['path'];

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class);
    }
}
