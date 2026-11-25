<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use App\Support\Blocking;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Public creator page: /@handle. Only approved creators have one. */
class CreatorPageController extends Controller
{
    public function show(Request $request, string $handle): Response
    {
        $creator = CreatorProfile::with('user:id,name,avatar_path')
            ->where('handle', mb_strtolower($handle))
            ->where('status', CreatorProfile::APPROVED)
            ->firstOrFail();
        $viewer = $request->user();
        abort_if(Blocking::hasBlocked($creator->user, $viewer), 404);
        $isOwner = $viewer?->id === $creator->user_id;

        // Pages with 18+ content are only for signed-in adults (their age was checked at sign-up).
        $gated = $creator->adult_content && ! $viewer;

        $sort = $request->query('sort') === 'popular' ? 'popular' : 'new';
        $tab = $request->query('tab') === 'media' ? 'media' : 'posts';
        $pinned = $tab === 'posts' && $sort === 'new' && $creator->pinned_post_id
            ? $creator->posts()->published()->with('media')->withEngagement($viewer)->find($creator->pinned_post_id)
            : null;
        $posts = $gated ? collect() : $creator->posts()->published()->with('media')->withEngagement($viewer)
            ->when($tab === 'media', fn ($q) => $q->has('media'))
            ->when($pinned, fn ($q) => $q->whereKeyNot($pinned->id))
            ->when($sort === 'popular', fn ($q) => $q->reorder()->orderByDesc('likes_count')->latest())
            ->take(60)->get()
            ->when($pinned && ! $gated, fn ($c) => $c->prepend($pinned))
            ->map(fn (Post $p) => [...self::present($p, $viewer), 'pinned' => $p->id === $creator->pinned_post_id]);

        return Inertia::render('creator/show', [
            'creator' => [
                ...$creator->only('handle', 'display_name', 'bio', 'price_monthly', 'adult_content'),
                'joined' => $creator->created_at->toIso8601String(),
                'avatar_url' => $creator->avatarUrl(),
                'cover_url' => $creator->coverUrl(),
                'posts_count' => $creator->posts()->published()->count(),
                'media_count' => $creator->posts()->published()->has('media')->count(),
                'followers_count' => $creator->followers()->count(),
            ],
            'following' => $viewer ? $creator->followers()->whereKey($viewer->id)->exists() : false,
            'posts' => $posts,
            'gated' => $gated,
            'sort' => $sort,
            'tab' => $tab,
            'isOwner' => $isOwner,
            'subscribed' => $creator->hasActiveSubscriber($viewer),
            'creatorUserId' => $creator->user_id,
            'creatorId' => $creator->id,
            'blocked' => Blocking::hasBlocked($viewer, $creator->user),
            // Why the Message button is disabled (null = can message): login | follow | subscribe | self ...
            'messageBlock' => ! $viewer ? 'login' : (\App\Support\Messaging::whyNot($viewer, $creator->user)),
            'subscribedUntil' => $viewer ? $creator->subscriptions()->active()->where('user_id', $viewer->id)->value('expires_at')?->toIso8601String() : null,
        ]);
    }

    /** A post as the viewer may see it: locked posts reveal only how many photos/videos they hold. */
    public static function present(Post $post, ?User $viewer): array
    {
        $lock = $post->lockReason($viewer);

        return [
            'id' => $post->id,
            'visibility' => $post->visibility,
            'is_adult' => $post->is_adult,
            'price' => $post->price,
            'publish_at' => $post->isScheduled() ? $post->publish_at->toIso8601String() : null,
            'created_at' => $post->created_at->toIso8601String(),
            'locked' => $lock,
            'body' => $lock ? null : $post->body,
            'media' => $lock ? [] : $post->media->map(fn ($m) => ['id' => $m->id, 'type' => $m->type, 'url' => route('media.show', $m)])->all(),
            'likes_count' => (int) ($post->likes_count ?? $post->likes()->count()),
            'comments_count' => (int) ($post->comments_count ?? $post->comments()->count()),
            'liked' => (bool) ($post->liked ?? false),
            'bookmarked' => (bool) ($post->bookmarked ?? false),
            'counts' => ['image' => $post->media->where('type', 'image')->count(), 'video' => $post->media->where('type', 'video')->count()],
        ];
    }
}
