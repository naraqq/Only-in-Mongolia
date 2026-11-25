<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Post extends Model
{
    public const PUBLIC = 'public';

    public const SUBSCRIBERS = 'subscribers';

    protected $fillable = ['creator_profile_id', 'body', 'visibility', 'is_adult'];

    protected $casts = ['is_adult' => 'boolean'];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(CreatorProfile::class, 'creator_profile_id');
    }

    public function media(): HasMany
    {
        return $this->hasMany(PostMedia::class)->orderBy('position');
    }

    /**
     * The one place that decides who may see a post (text and media):
     * - the creator and admins always;
     * - 18+ posts never to signed-out visitors;
     * - free posts to everyone else;
     * - subscribers-only posts to active subscribers.
     */
    public function isVisibleTo(?User $viewer): bool
    {
        if ($viewer && ($viewer->is_admin || $viewer->id === $this->creator->user_id)) {
            return true;
        }
        if ($this->is_adult && ! $viewer) {
            return false;
        }
        if ($this->visibility === self::PUBLIC) {
            return true;
        }

        return $this->creator->hasActiveSubscriber($viewer);
    }

    /** Why it's hidden, so the page can show the right prompt. */
    public function lockReason(?User $viewer): ?string
    {
        if ($this->isVisibleTo($viewer)) {
            return null;
        }

        return $this->is_adult && ! $viewer ? 'login' : 'subscribe';
    }
}
