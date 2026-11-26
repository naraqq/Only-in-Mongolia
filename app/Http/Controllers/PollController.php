<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Models\PostPollVote;
use App\Models\User;
use App\Support\Blocking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class PollController extends Controller
{
    public function vote(Request $request, Post $post): JsonResponse
    {
        $viewer = $request->user();
        abort_unless($post->poll_options && $post->creator->isApproved()
            && ! $post->held_at && ! $post->isScheduled() && $post->isVisibleTo($viewer)
            && ! Blocking::between($viewer, $post->creator->user), 404);
        abort_if($viewer->id === $post->creator->user_id, 403);
        $vote = $request->validate(['option' => ['required', 'integer', 'min:0', 'max:'.(count($post->poll_options) - 1)]]);

        PostPollVote::query()->insertOrIgnore([
            'post_id' => $post->id, 'user_id' => $viewer->id, 'option_index' => $vote['option'],
        ]);
        $post->load([
            'pollTally' => fn ($votes) => $votes->selectRaw('post_id, option_index, count(*) as total')->groupBy('post_id', 'option_index'),
            'pollVote' => fn ($votes) => $votes->where('user_id', $viewer->id),
            'pollFollowUp' => fn ($posts) => $posts->published(),
        ]);

        return response()->json(['poll' => self::present($post, $viewer)]);
    }

    public function followUp(Request $request, Post $post): RedirectResponse
    {
        abort_unless($post->poll_options && $post->creator->isApproved() && $request->user()->id === $post->creator->user_id, 404);
        $data = $request->validate(['post_id' => ['nullable', 'integer', 'not_in:'.$post->id]]);
        $followUp = isset($data['post_id']) ? $post->creator->posts()->published()->findOrFail($data['post_id']) : null;
        $post->forceFill(['poll_follow_up_id' => $followUp?->id])->save();

        return back();
    }

    public static function present(Post $post, ?User $viewer): ?array
    {
        if (! $post->poll_options) {
            return null;
        }

        $totals = $post->pollTally->pluck('total', 'option_index');
        $followUp = $post->pollFollowUp;
        $owner = $viewer?->id === $post->creator->user_id;
        $vote = $viewer && $post->relationLoaded('pollVote') ? $post->pollVote?->option_index : null;

        return [
            'options' => array_map(fn ($label, $index) => [
                'label' => $label,
                'votes' => (int) ($totals[$index] ?? 0),
            ], $post->poll_options, array_keys($post->poll_options)),
            'selected' => $vote,
            'can_vote' => $viewer !== null && ! $owner && ! $post->isScheduled() && ! $post->held_at,
            'follow_up_id' => $followUp && ($viewer || ! $followUp->is_adult) ? $followUp->id : null,
        ];
    }
}
