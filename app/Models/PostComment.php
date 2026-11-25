<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PostComment extends Model
{
    protected $fillable = ['post_id', 'user_id', 'body'];

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The comment's author, the post's creator and admins can delete it. */
    public function canBeDeletedBy(?User $user): bool
    {
        return $user !== null && ($user->id === $this->user_id || $user->is_admin || $user->id === $this->post->creator->user_id);
    }
}
