<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * php artisan media:copy --to=r2 — copy creators' stored files (posts, messages, library, ID documents) from this
 * server to the media bucket, before switching MEDIA_DISK. Safe to run again: files already there are skipped.
 * Nothing is deleted; remove the local copies yourself once the site runs on the bucket.
 */
class MediaCopy extends Command
{
    protected $signature = 'media:copy {--from=local : Where the files are now} {--to=r2 : Where they should go} {--dry-run : Only count}';

    protected $description = 'Copy stored photos, videos and ID documents to another disk (e.g. Cloudflare R2)';

    /** The folders the media disk holds (see App\Media\Files). */
    private const FOLDERS = ['posts', 'messages', 'library', 'creator-ids'];

    public function handle(): int
    {
        $from = Storage::disk($this->option('from'));
        $to = Storage::disk($this->option('to'));
        $dry = (bool) $this->option('dry-run');
        $copied = $skipped = $failed = 0;
        $bytes = 0;

        foreach (self::FOLDERS as $folder) {
            foreach ($from->allFiles($folder) as $path) {
                $size = $from->size($path);
                try {
                    if ($to->exists($path) && $to->size($path) === $size) {
                        $skipped++;

                        continue;
                    }
                    if (! $dry) {
                        $in = $from->readStream($path);
                        $to->writeStream($path, $in, ['visibility' => 'private', 'ContentType' => $from->mimeType($path) ?: 'application/octet-stream']);
                        is_resource($in) && fclose($in);
                    }
                    $copied++;
                    $bytes += $size;
                } catch (Throwable $e) {
                    $failed++;
                    $this->error("✗ {$path}: {$e->getMessage()}");
                }
            }
        }

        $mb = number_format($bytes / 1048576, 1);
        $this->info(($dry ? 'Would copy' : 'Copied')." {$copied} files ({$mb} MB), {$skipped} already there, {$failed} failed.");

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
