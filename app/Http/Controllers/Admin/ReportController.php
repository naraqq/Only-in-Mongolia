<?php

namespace App\Http\Controllers\Admin;

use App\Media\Stamp;
use App\Moderation\Moderation;
use App\Http\Controllers\Controller;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\Post;
use App\Models\PostComment;
use App\Models\Report;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Moderation queue. Urgent reasons (minors, non-consensual content) come first.
 * Actions: dismiss, remove the content, or suspend the creator (their page and studio disappear until reinstated).
 */
class ReportController extends Controller
{
    public function index(): Response
    {
        $open = Report::with(['reportable', 'reporter:id,name'])->where('status', 'open')
            ->orderByRaw("case when reason in ('minor','nonconsensual') then 0 else 1 end")->oldest()->take(100)->get();
        $done = Report::with(['reportable', 'reporter:id,name'])->where('status', '!=', 'open')->latest('resolved_at')->take(30)->get();

        return Inertia::render('admin/reports', [
            'open' => $open->map(fn (Report $r) => $this->present($r)),
            'done' => $done->map(fn (Report $r) => $this->present($r)),
            'suspended' => CreatorProfile::where('status', CreatorProfile::SUSPENDED)->get(['id', 'handle', 'display_name'])->toArray(),
        ]);
    }

    public function act(Request $request, Report $report): RedirectResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:dismiss,remove,suspend'],
            'note' => ['nullable', 'string', 'max:300'],
        ]);
        abort_unless($report->status === 'open', 409, 'Already handled.');
        $target = $report->reportable;
        abort_if($data['action'] !== 'dismiss' && ! $target, 422, 'The reported content no longer exists.');

        DB::transaction(function () use ($report, $target, $data, $request) {
            if ($data['action'] === 'remove') {
                // The files can never be uploaded again, by anyone.
                if ($target instanceof Post || $target instanceof Message) {
                    Moderation::block($target->media, $report->reason, "report:{$report->id}", $request->user()->id);
                }
                $this->remove($target);
            }
            // Dismissing a report from the automatic scan releases what it held back.
            if ($data['action'] === 'dismiss' && $target instanceof Post && $target->held_at) {
                $target->forceFill(['held_at' => null])->saveQuietly();
                $target->media()->where('scan_status', 'flagged')->update(['scan_status' => 'ok']);
            }
            if ($data['action'] === 'suspend') {
                $creator = $this->creatorOf($target);
                abort_unless($creator, 422, 'There is no creator to suspend.');
                $creator->update(['status' => CreatorProfile::SUSPENDED]);
            }

            // Resolve every open report about the same thing at once.
            Report::where('status', 'open')->where(fn ($q) => $q->whereKey($report->id)
                ->orWhere(fn ($w) => $w->where('reportable_type', $report->reportable_type)->where('reportable_id', $report->reportable_id)->whereNotNull('reportable_id')))
                ->update([
                    'status' => $data['action'] === 'dismiss' ? 'dismissed' : 'actioned',
                    'resolution' => trim($data['action'].(! empty($data['note']) ? ': '.$data['note'] : '')),
                    'resolved_by' => $request->user()->id,
                    'resolved_at' => now(),
                ]);
        });

        return back();
    }

    /** Lift a suspension. */
    public function reinstate(CreatorProfile $creator): RedirectResponse
    {
        abort_unless($creator->status === CreatorProfile::SUSPENDED, 409);
        $creator->update(['status' => CreatorProfile::APPROVED]);

        return back();
    }

    private function remove(object $target): void
    {
        match (true) {
            $target instanceof Post => (function () use ($target) {
                Storage::delete($target->media->pluck('path')->all());
                foreach ($target->media as $m) {
                    Storage::deleteDirectory(Stamp::folder($m->path));
                }
                $target->delete();
            })(),
            $target instanceof Message => (function () use ($target) {
                // Files may be shared by copies of a mass message, so only the file rows go; the files stay until cleanup.
                $target->delete();
            })(),
            $target instanceof PostComment => $target->delete(),
            $target instanceof CreatorProfile => $target->update(['status' => CreatorProfile::SUSPENDED]),
        };
    }

    private function creatorOf(object $target): ?CreatorProfile
    {
        $creator = match (true) {
            $target instanceof CreatorProfile => $target,
            $target instanceof Post => $target->creator,
            $target instanceof PostComment => $target->user->creatorProfile,
            $target instanceof Message => $target->sender->creatorProfile,
            default => null,
        };

        return $creator && in_array($creator->status, [CreatorProfile::APPROVED, CreatorProfile::SUSPENDED], true) ? $creator : null;
    }

    private function present(Report $r): array
    {
        $t = $r->reportable;
        $type = array_search($r->reportable_type, Report::TYPES, true) ?: null;
        $creator = $t ? $this->creatorOf($t) : null;

        return [
            'id' => $r->id,
            'reason' => $r->reason,
            'urgent' => $r->isUrgent(),
            'details' => $r->details,
            'type' => $type ?: ($r->url ? 'url' : null),
            'exists' => (bool) $t,
            'preview' => match (true) {
                $t instanceof Post => ['text' => $t->body, 'media' => $t->media->count(), 'url' => route('creator.show', $t->creator->handle)],
                $t instanceof PostComment => ['text' => $t->body, 'url' => route('creator.show', $t->post->creator->handle)],
                $t instanceof CreatorProfile => ['text' => $t->display_name.' (@'.$t->handle.')', 'url' => route('creator.show', $t->handle)],
                $t instanceof Message => ['text' => $t->body, 'media' => $t->media->count()],
                default => ['text' => $r->url],
            },
            'creator' => $creator ? ['handle' => $creator->handle, 'status' => $creator->status] : null,
            'reporter' => $r->reporter?->name ?? $r->contact_name ?? (str_starts_with((string) $r->details, 'Automatic scan') ? '🤖 Auto scan' : null),
            'contact_email' => $r->contact_email,
            'status' => $r->status,
            'resolution' => $r->resolution,
            'created_at' => $r->created_at->toIso8601String(),
        ];
    }
}
