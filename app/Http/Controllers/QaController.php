<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\QaQuestion;
use App\Models\User;
use App\Notifications\Activity;
use App\Support\Blocking;
use App\Support\Live;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Live Q&A on a post: before it starts fans ask "remind me" (the demand signal) and send questions; while it's
 * live the creator answers the most-upvoted ones and the page refreshes the list every few seconds; afterwards
 * the answers stay on the post. Text only for now: no video, so moderation is the creator hiding a question.
 */
class QaController extends Controller
{
    /** How long a Q&A can run. */
    public const MINUTES = [15, 30, 45, 60, 90, 120];

    /** Open (unanswered) questions one fan may have in one Q&A, so a few people can't flood it. */
    public const OPEN_PER_FAN = 3;

    public function show(Request $request, Post $post): JsonResponse
    {
        $this->viewable($request->user(), $post);

        return response()->json(['qa' => self::full($post, $request->user())]);
    }

    public function rsvp(Request $request, Post $post): JsonResponse
    {
        $me = $request->user();
        $this->viewable($me, $post);
        abort_if($me->id === $post->creator->user_id, 403);
        abort_if($post->qaState() === 'ended', 422, 'This Q&A has ended.');

        $on = $request->boolean('on');
        if ($on) {
            DB::table('qa_rsvps')->insertOrIgnore(['post_id' => $post->id, 'user_id' => $me->id, 'created_at' => now()]);
        } else {
            DB::table('qa_rsvps')->where('post_id', $post->id)->where('user_id', $me->id)->delete();
        }

        Live::qa($post->id);

        return response()->json(['qa' => self::full($post, $me)]);
    }

    public function ask(Request $request, Post $post): JsonResponse
    {
        $me = $request->user();
        $this->viewable($me, $post);
        abort_if($me->id === $post->creator->user_id, 403);
        abort_if($post->qaState() === 'ended', 422, 'This Q&A has ended.');
        $data = $request->validate(['body' => ['required', 'string', 'min:3', 'max:300']]);

        $open = $post->qaQuestions()->where('user_id', $me->id)->whereNull('answered_at')->whereNull('hidden_at')->count();
        if ($open >= self::OPEN_PER_FAN) {
            return response()->json(['message' => __('You can have :n open questions at a time.', ['n' => self::OPEN_PER_FAN])], 422);
        }
        $post->qaQuestions()->create(['user_id' => $me->id, 'body' => trim($data['body'])]);

        Live::qa($post->id);

        return response()->json(['qa' => self::full($post, $me)]);
    }

    public function vote(Request $request, QaQuestion $question): JsonResponse
    {
        $me = $request->user();
        $post = $question->post;
        $this->viewable($me, $post);
        abort_if($question->hidden_at || $question->user_id === $me->id, 404);

        DB::transaction(function () use ($request, $question, $me) {
            if ($request->boolean('on')) {
                $added = DB::table('qa_question_votes')->insertOrIgnore(['qa_question_id' => $question->id, 'user_id' => $me->id]);
                $added && $question->increment('votes_count');
            } else {
                $removed = DB::table('qa_question_votes')->where('qa_question_id', $question->id)->where('user_id', $me->id)->delete();
                $removed && $question->decrement('votes_count');
            }
        });

        Live::qa($post->id);

        return response()->json(['qa' => self::full($post, $me)]);
    }

    /** The creator answers (or edits an answer) once the Q&A has started. */
    public function answer(Request $request, QaQuestion $question): JsonResponse
    {
        $me = $request->user();
        $post = $question->post;
        abort_unless($post->creator->user_id === $me->id, 404);
        abort_if($post->qaState() === 'upcoming', 422, 'The Q&A hasn’t started yet.');
        $data = $request->validate(['answer' => ['required', 'string', 'max:2000']]);

        $first = $question->answered_at === null;
        $question->forceFill(['answer' => trim($data['answer']), 'answered_at' => $question->answered_at ?? now(), 'hidden_at' => null])->save();
        if ($first && $question->user) {
            $question->user->notify(new Activity('qa_answered', $me->id, ['post_id' => $post->id, 'handle' => $post->creator->handle]));
        }

        Live::qa($post->id);

        return response()->json(['qa' => self::full($post, $me)]);
    }

    /** The creator takes a question off the list (or puts it back). */
    public function hide(Request $request, QaQuestion $question): JsonResponse
    {
        $post = $question->post;
        abort_unless($post->creator->user_id === $request->user()->id, 404);
        $question->forceFill(['hidden_at' => $request->boolean('hidden') ? now() : null])->save();

        Live::qa($post->id);

        return response()->json(['qa' => self::full($post, $request->user())]);
    }

    /** What a post card needs without loading questions (counts come from Post::withEngagement). */
    public static function summary(Post $post, ?User $viewer): ?array
    {
        if (! $post->qa_starts_at) {
            return null;
        }

        return [
            'state' => $post->qaState(),
            'starts_at' => $post->qa_starts_at->toIso8601String(),
            'ends_at' => $post->qa_ends_at?->toIso8601String(),
            'rsvps' => (int) ($post->qa_rsvps_count ?? $post->qaRsvps()->count()),
            'rsvped' => $viewer ? (bool) ($post->qa_rsvped ?? $post->qaRsvps()->whereKey($viewer->id)->exists()) : false,
            'questions' => (int) ($post->qa_questions_count ?? $post->qaQuestions()->whereNull('hidden_at')->count()),
            'owner' => $viewer?->id === $post->creator->user_id,
        ];
    }

    /** The summary plus the questions: open ones by votes, then answered ones newest first. */
    public static function full(Post $post, ?User $viewer): array
    {
        $post->unsetRelation('qaRsvps');
        $post->offsetUnset('qa_rsvps_count');
        $post->offsetUnset('qa_questions_count');
        $post->offsetUnset('qa_rsvped');
        $owner = $viewer?->id === $post->creator->user_id;
        $voted = $viewer ? DB::table('qa_question_votes')->join('qa_questions', 'qa_questions.id', '=', 'qa_question_votes.qa_question_id')
            ->where('qa_questions.post_id', $post->id)->where('qa_question_votes.user_id', $viewer->id)->pluck('qa_question_id')->flip() : collect();
        $questions = $post->qaQuestions()->with('user.creatorProfile')
            ->when(! $owner, fn ($q) => $q->whereNull('hidden_at'))
            ->orderByRaw('answered_at is not null')->orderByDesc('votes_count')->orderBy('id')
            ->take(300)->get();

        return [
            ...self::summary($post, $viewer),
            'can_ask' => $viewer !== null && ! $owner && $post->qaState() !== 'ended',
            'open_per_fan' => self::OPEN_PER_FAN,
            'list' => $questions
                ->sortBy(fn (QaQuestion $q) => $q->answered_at ? -$q->answered_at->getTimestamp() : -PHP_INT_MAX)
                ->values()
                ->map(function (QaQuestion $q) use ($viewer, $voted) {
                    $creator = $q->user?->creatorProfile?->status === CreatorProfile::APPROVED ? $q->user->creatorProfile : null;

                    return [
                        'id' => $q->id,
                        'body' => $q->body,
                        'votes' => $q->votes_count,
                        'voted' => $voted->has($q->id),
                        'mine' => $viewer?->id === $q->user_id,
                        'answer' => $q->answer,
                        'answered_at' => $q->answered_at?->toIso8601String(),
                        'hidden' => $q->hidden_at !== null,
                        'user' => ['name' => $creator?->display_name ?? $q->user?->name ?? '—', 'avatar_url' => $q->user?->avatar_url],
                    ];
                })->all(),
        ];
    }

    private function viewable(?User $viewer, Post $post): void
    {
        abort_unless($post->qa_starts_at && $post->creator->isApproved() && ! $post->held_at && $post->isVisibleTo($viewer), 404);
        abort_if($viewer && Blocking::between($viewer, $post->creator->user), 404);
    }
}
