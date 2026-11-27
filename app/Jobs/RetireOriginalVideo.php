<?php

namespace App\Jobs;

use App\Media\Files;
use App\Media\Transcoding;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Remove an uploaded video a few minutes after its web version replaced it. Anything that still points at the
 * original by then (a post published in the very moment of the switch) is moved over first.
 */
class RetireOriginalVideo implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public string $original, public string $web)
    {
        $this->onConnection('media');
        $this->onQueue('media');
    }

    public function handle(): void
    {
        if (Files::exists($this->web)) {
            Transcoding::swap($this->original, $this->web);
        }
        if (! Transcoding::inUse($this->original)) {
            Files::delete($this->original);
        }
    }
}
