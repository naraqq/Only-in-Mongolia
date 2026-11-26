<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A comment on a post, or (with parent_id) a reply to a top-level comment. */
class PostComment extends Model
{
    protected $fillable = ['post_id', 'user_id', 'parent_id', 'body'];

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    /** People who liked this comment. */
    public function likes(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'comment_likes')->withTimestamps();
    }

    /** The comment's author, the post's creator and admins can delete it. */
    public function canBeDeletedBy(?User $user): bool
    {
        return $user !== null && ($user->id === $this->user_id || $user->is_admin || $user->id === $this->post->creator->user_id);
    }
}
