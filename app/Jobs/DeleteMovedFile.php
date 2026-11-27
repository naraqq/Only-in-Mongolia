<?php

namespace App\Jobs;

use App\Media\Files;
use App\Media\Stamp;
use App\Media\Transcoding;
use App\Models\CreatorProfile;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Remove a file's old copy a few minutes after php artisan media:relayout moved it (pages loaded just before the move
 * still find it meanwhile). Anything that still points at the old path by then is switched to the new one first.
 */
class DeleteMovedFile implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @param  list<string>  $old  the old copies to remove (the file, and its frames) */
    public function __construct(public string $from, public string $to, public array $old) {}

    public function handle(): void
    {
        if (! Files::exists($this->to)) {
            return; // the new copy is gone: keep the old one
        }
        foreach (['media_uploads', 'vault_items', 'post_media', 'message_media'] as $table) {
            DB::table($table)->where('path', $this->from)->update(['path' => $this->to]);
        }
        $kycStillUsed = CreatorProfile::where('id_front_path', $this->from)->orWhere('id_back_path', $this->from)->orWhere('selfie_path', $this->from)->exists();
        if (Transcoding::inUse($this->from) || $kycStillUsed) {
            return;
        }
        // Each old copy lives on whichever disk it was on (this server, before a switch to the bucket).
        foreach ($this->old as $path) {
            Files::disk($path)->delete($path);
            Storage::disk('local')->delete('media-cache/'.$path); // a downloaded copy for stamping or scanning
        }
        Storage::disk('local')->deleteDirectory(Stamp::folder($this->from)); // stamped copies of the old path
    }
}
