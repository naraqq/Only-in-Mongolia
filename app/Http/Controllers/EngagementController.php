<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\PostComment;
use App\Notifications\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Likes, comments and saved posts. Only on posts the person can actually see. Actions answer with JSON. */
class EngagementController extends Controller
{
    private function visible(Request $request, Post $post): Post
    {
        $post->loadMissing('creator');
        abort_unless($post->creator->isApproved() && $post->isVisibleTo($request->user()), 404);

        return $post;
    }

    public function like(Request $request, Post $post): JsonResponse
    {
        $this->visible($request, $post);
        $changes = $post->likes()->toggle([$request->user()->id]);

        return response()->json(['liked' => (bool) $changes['attached'], 'likes_count' => $post->likes()->count()]);
    }

    public function bookmark(Request $request, Post $post): JsonResponse
    {
        $this->visible($request, $post);
        $changes = $post->bookmarkedBy()->toggle([$request->user()->id]);

        return response()->json(['bookmarked' => (bool) $changes['attached']]);
    }

    public function comments(Request $request, Post $post): JsonResponse
    {
        $this->visible($request, $post);
        $comments = $post->comments()->with('user.creatorProfile:id,user_id,handle,display_name,status')->oldest('id')->take(200)->get();

        return response()->json(['comments' => $comments->map(fn (PostComment $c) => $this->present($c, $request))]);
    }

    public function comment(Request $request, Post $post): JsonResponse
    {
        $this->visible($request, $post);
        $data = $request->validate(['body' => ['required', 'string', 'max:1000']]);

        $comment = $post->comments()->create(['user_id' => $request->user()->id, 'body' => trim($data['body'])]);
        if ($post->creator->user_id !== $request->user()->id) {
            $post->creator->user->notify(new Activity('commented', $request->user()->id, [
                'post_id' => $post->id,
                'handle' => $post->creator->handle,
                'note' => mb_strimwidth($comment->body, 0, 120, '…'),
            ]));
        }

        return response()->json(['comment' => $this->present($comment->load('user.creatorProfile'), $request)], 201);
    }

    public function deleteComment(Request $request, PostComment $comment): JsonResponse
    {
        abort_unless($comment->canBeDeletedBy($request->user()), 403);
        $comment->delete();

        return response()->json(['deleted' => true]);
    }

    /** Saved posts, newest save first. Posts that became locked show as locked. */
    public function saved(Request $request): Response
    {
        $viewer = $request->user();
        $posts = $viewer->bookmarks()->with(['media', 'creator.user:id,avatar_path'])->withEngagement($viewer)
            ->orderByDesc('bookmarks.created_at')->take(100)->get()
            ->filter(fn (Post $p) => $p->creator->status === CreatorProfile::APPROVED)
            ->map(fn (Post $p) => [
                ...CreatorPageController::present($p, $viewer),
                'author' => ['name' => $p->creator->display_name, 'handle' => $p->creator->handle, 'price' => $p->creator->price_monthly, 'avatar_url' => $p->creator->avatarUrl()],
            ])->values();

        return Inertia::render('bookmarks', ['posts' => $posts]);
    }

    private function present(PostComment $c, Request $request): array
    {
        $creator = $c->user->creatorProfile?->status === CreatorProfile::APPROVED ? $c->user->creatorProfile : null;

        return [
            'id' => $c->id,
            'body' => $c->body,
            'created_at' => $c->created_at->toIso8601String(),
            'user' => ['name' => $creator?->display_name ?? $c->user->name, 'handle' => $creator?->handle, 'avatar_url' => $c->user->avatar_url],
            'can_delete' => $c->canBeDeletedBy($request->user()),
        ];
    }
}
