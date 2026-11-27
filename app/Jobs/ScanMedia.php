<?php

namespace App\Jobs;

use App\Media\Files;
use App\Models\MessageMedia;
use App\Models\Post;
use App\Models\PostMedia;
use App\Models\Report;
use App\Moderation\Scanner;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Run the automatic scan on one saved photo or video. If it's flagged: the file is no longer served, a post
 * is held back (only its creator and admins see it), and an urgent report goes to the admin queue.
 * The uploader is not told why.
 */
class ScanMedia implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public string $model, public int $id) {}

    public function handle(Scanner $scanner): void
    {
        /** @var PostMedia|MessageMedia|null $media */
        $media = $this->model::find($this->id);
        if (! $media || $media->scan_status !== 'pending' || ! Files::exists($media->path)) {
            return;
        }

        // The image/video scanner can't judge sound: audio relies on the blocklist and on reports.
        if ($media->type === 'audio') {
            $media->forceFill(['scan_status' => 'ok', 'scan_labels' => null])->save();

            return;
        }

        $owner = $media instanceof PostMedia ? $media->post : $media->message;
        $adult = $media instanceof PostMedia ? (bool) $owner?->is_adult : false;
        $result = $scanner->scan(Files::localPath($media->path), (string) $media->mime, $adult);

        $media->forceFill([
            'scan_status' => match ($result['verdict']) {
                'flag' => 'flagged',
                'error' => 'error',
                default => 'ok',
            },
            'scan_labels' => $result['labels'],
        ])->save();

        if ($result['verdict'] !== 'flag' || ! $owner) {
            return;
        }
        if ($owner instanceof Post) {
            $owner->forceFill(['held_at' => now()])->saveQuietly();
        }
        $already = Report::where('status', 'open')->whereNull('reporter_id')->where('reportable_type', $owner::class)->where('reportable_id', $owner->id)->exists();
        if (! $already) {
            Report::create([
                'reporter_id' => null,
                'reportable_type' => $owner::class,
                'reportable_id' => $owner->id,
                'reason' => in_array($result['reason'], Report::REASONS, true) ? $result['reason'] : 'other',
                'details' => 'Automatic scan: '.json_encode($result['labels']),
                'status' => 'open',
            ]);
        }
    }
}
