<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
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
        $isOwner = $viewer?->id === $creator->user_id;

        // Pages with 18+ content are only for signed-in adults (their age was checked at sign-up).
        $gated = $creator->adult_content && ! $viewer;

        $posts = $gated ? collect() : $creator->posts()->with('media')->take(50)->get()->map(fn (Post $p) => self::present($p, $viewer));

        return Inertia::render('creator/show', [
            'creator' => [
                ...$creator->only('handle', 'display_name', 'bio', 'price_monthly', 'adult_content'),
                'joined' => $creator->created_at->toIso8601String(),
                'avatar_url' => $creator->avatarUrl(),
                'cover_url' => $creator->coverUrl(),
                'posts_count' => $creator->posts()->count(),
                'followers_count' => $creator->followers()->count(),
            ],
            'following' => $viewer ? $creator->followers()->whereKey($viewer->id)->exists() : false,
            'posts' => $posts,
            'gated' => $gated,
            'isOwner' => $isOwner,
            'subscribed' => $creator->hasActiveSubscriber($viewer),
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
            'created_at' => $post->created_at->toIso8601String(),
            'locked' => $lock,
            'body' => $lock ? null : $post->body,
            'media' => $lock ? [] : $post->media->map(fn ($m) => ['id' => $m->id, 'type' => $m->type, 'url' => route('media.show', $m)])->all(),
            'counts' => ['image' => $post->media->where('type', 'image')->count(), 'video' => $post->media->where('type', 'video')->count()],
        ];
    }
}
