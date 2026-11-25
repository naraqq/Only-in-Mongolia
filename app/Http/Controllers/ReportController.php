<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\Post;
use App\Models\PostComment;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** "Report" on a post, comment, creator or message. Anyone signed in who can see it can report it once. */
class ReportController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(array_keys(Report::TYPES))],
            'id' => ['required', 'integer'],
            'reason' => ['required', Rule::in(Report::REASONS)],
            'details' => ['nullable', 'string', 'max:1000'],
        ]);
        $me = $request->user();
        $target = Report::TYPES[$data['type']]::findOrFail($data['id']);

        // You can only report what you can see.
        $visible = match (true) {
            $target instanceof Post => $target->creator->isApproved() && $target->isVisibleTo($me),
            $target instanceof PostComment => $target->post->isVisibleTo($me),
            $target instanceof CreatorProfile => $target->isApproved(),
            $target instanceof Message => $target->conversation->includes($me) && $target->sender_id !== $me->id,
        };
        abort_unless($visible, 404);

        Report::firstOrCreate(
            ['reporter_id' => $me->id, 'reportable_type' => $target::class, 'reportable_id' => $target->id, 'status' => 'open'],
            ['reason' => $data['reason'], 'details' => $data['details'] ?? null],
        );

        return response()->json(['reported' => true], 201);
    }
}
