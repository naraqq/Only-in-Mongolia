<?php

namespace App\Jobs;

use App\Media\Ffmpeg;
use App\Media\Transcoding;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Convert one uploaded video for the web and make its frames (App\Media\Transcoding). Runs on its own "media"
 * queue and worker (php artisan queue:work media --queue=media), since a long video can take many minutes.
 */
class TranscodeVideo implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 4;

    public int $timeout;

    public bool $failOnTimeout = true;

    public function __construct(public string $path)
    {
        $this->timeout = (int) config('media.timeout');
        $this->onConnection('media');
        $this->onQueue('media');
    }

    /** One conversion per file at a time, even if it was queued twice. */
    public function uniqueId(): string
    {
        return $this->path;
    }

    public function uniqueFor(): int
    {
        return $this->timeout + 600;
    }

    public function handle(Ffmpeg $ffmpeg): void
    {
        if (! Transcoding::run($this->path, $ffmpeg) && $this->attempts() < $this->tries) {
            $this->release(60); // stored a moment before the message or library item that uses it: try again shortly
        }
    }
}
