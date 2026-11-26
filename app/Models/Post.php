<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Post extends Model
{
    public const PUBLIC = 'public';

    public const SUBSCRIBERS = 'subscribers';

    protected $fillable = ['creator_profile_id', 'body', 'visibility', 'is_adult', 'price', 'publish_at', 'announced_at'];

    protected $casts = ['is_adult' => 'boolean', 'price' => 'integer', 'publish_at' => 'datetime', 'announced_at' => 'datetime', 'held_at' => 'datetime'];

    /** Posts that are out (not scheduled for later). */
    public function scopePublished(\Illuminate\Database\Eloquent\Builder $q): \Illuminate\Database\Eloquent\Builder
    {
        // Out, and not held back by the automatic scan.
        return $q->whereNull('held_at')->where(fn ($w) => $w->whereNull('publish_at')->orWhere('publish_at', '<=', now()));
    }

    public function isScheduled(): bool
    {
        return $this->publish_at !== null && $this->publish_at->isFuture();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(CreatorProfile::class, 'creator_profile_id');
    }

    public function likes(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(User::class, 'post_likes')->withTimestamps();
    }

    public function bookmarkedBy(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(User::class, 'bookmarks')->withTimestamps();
    }

    public function comments(): HasMany
    {
        return $this->hasMany(PostComment::class);
    }

    /** Like/comment counts, and whether $viewer liked or saved each post, in the same query. */
    public function scopeWithEngagement(\Illuminate\Database\Eloquent\Builder $q, ?User $viewer): \Illuminate\Database\Eloquent\Builder
    {
        return $q->withCount(['likes', 'comments'])->when($viewer, fn ($w) => $w->withExists([
            'likes as liked' => fn ($l) => $l->where('users.id', $viewer->id),
            'bookmarkedBy as bookmarked' => fn ($b) => $b->where('users.id', $viewer->id),
        ]));
    }

    public function media(): HasMany
    {
        return $this->hasMany(PostMedia::class)->orderBy('position');
    }

    /**
     * The one place that decides who may see a post (text and media):
     * - the creator and admins always;
     * - 18+ posts never to signed-out visitors;
     * - pay-per-view posts (with a price) to people who bought them, subscribers included;
     * - free posts to everyone else;
     * - subscribers-only posts to active subscribers.
     */
    public function isVisibleTo(?User $viewer): bool
    {
        if ($viewer && ($viewer->is_admin || $viewer->id === $this->creator->user_id)) {
            return true;
        }
        if ($this->isScheduled() || $this->held_at) {
            return false; // nobody else sees it before it's published, or while it waits for review
        }
        if ($this->is_adult && ! $viewer) {
            return false;
        }
        if ($this->price) {
            return Purchase::hasPost($viewer, $this);
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

        if ($this->is_adult && ! $viewer) {
            return 'login';
        }

        return $this->price ? 'buy' : 'subscribe';
    }
}
