<?php

namespace App\Console\Commands;

use App\Media\Files;
use Illuminate\Console\Command;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * php artisan media:backup — copy every media file (photos, videos, their frames and streaming pieces, ID documents)
 * to the backup bucket (filesystems.disks.backup, BACKUP_BUCKET), under media/. Runs nightly; each run copies only
 * what's new or changed (by name and size), so after the first it's quick.
 *
 * Files deleted from the media disk stay in the backup for --keep-deleted days (30 by default), so a mistaken
 * delete can still be undone; after that they go. --restore copies back whatever the media disk is missing.
 */
class MediaBackup extends Command
{
    protected $signature = 'media:backup
        {--restore : Copy files the media disk is missing back from the backup}
        {--keep-deleted=30 : Days a file deleted from the media disk stays in the backup}
        {--dry-run : Only count what would be copied}';

    protected $description = 'Copy media files to the backup bucket (or restore them from it)';

    private const PREFIX = 'media/';

    /** When each file was first seen missing from the media disk (so it's removed from the backup only later). */
    private const GONE = 'backup/media-gone.json';

    public function handle(): int
    {
        if (! config('filesystems.disks.backup.bucket')) {
            $this->warn('No backup bucket: set BACKUP_BUCKET (and BACKUP_* keys if it is elsewhere). Nothing copied.');

            return self::SUCCESS;
        }
        $media = Files::disk();
        $backup = Storage::disk('backup');

        try {
            return $this->option('restore') ? $this->restore($media, $backup) : $this->backup($media, $backup);
        } catch (Throwable $e) {
            $this->error('Backup failed: '.$e->getMessage());
            report($e);

            return self::FAILURE;
        }
    }

    private function backup(Filesystem $media, Filesystem $backup): int
    {
        $have = $this->sizes($backup, self::PREFIX);
        $copied = 0;
        $bytes = 0;
        $seen = [];
        foreach ($media->allFiles() as $path) {
            if (! self::isMedia($path)) {
                continue; // working copies and other app files, not media
            }
            $seen[self::PREFIX.$path] = true;
            $size = $media->size($path);
            if (($have[self::PREFIX.$path] ?? null) === $size) {
                continue;
            }
            if (! $this->option('dry-run')) {
                $this->copy($media, $path, $backup, self::PREFIX.$path);
            }
            $copied++;
            $bytes += $size;
        }

        // Files no longer on the media disk: remembered from the first night they're missing, removed later.
        $gone = $this->gone();
        $today = now()->toDateString();
        $removed = 0;
        foreach (array_keys($have) as $key) {
            if (isset($seen[$key])) {
                unset($gone[$key]);

                continue;
            }
            $gone[$key] ??= $today;
            if (Carbon::parse($gone[$key])->diffInDays(now()) >= (int) $this->option('keep-deleted') && ! $this->option('dry-run')) {
                $backup->delete($key);
                unset($gone[$key]);
                $removed++;
            }
        }
        foreach (array_keys($gone) as $key) {
            if (! isset($have[$key])) {
                unset($gone[$key]);
            }
        }
        if (! $this->option('dry-run')) {
            Storage::disk('local')->put(self::GONE, json_encode($gone));
        }

        $this->info(sprintf('%s%d file(s) copied (%.1f MB); %d kept from deleted files; %d removed after %d days.',
            $this->option('dry-run') ? '[dry run] ' : '', $copied, $bytes / 1048576, count($gone), $removed, (int) $this->option('keep-deleted')));

        return self::SUCCESS;
    }

    private function restore(Filesystem $media, Filesystem $backup): int
    {
        $restored = 0;
        foreach ($backup->allFiles(rtrim(self::PREFIX, '/')) as $key) {
            $path = substr($key, strlen(self::PREFIX));
            if ($media->exists($path)) {
                continue;
            }
            if (! $this->option('dry-run')) {
                $this->copy($backup, $key, $media, $path);
            }
            $restored++;
        }
        $this->info(($this->option('dry-run') ? '[dry run] ' : '')."{$restored} file(s) restored.");

        return self::SUCCESS;
    }

    /** Media files: the current layout (users/, kyc/) and older folders not moved yet (media:relayout). */
    private static function isMedia(string $path): bool
    {
        foreach (['users/', 'kyc/', 'posts/', 'uploads/', 'library/', 'messages/', 'creator-ids/'] as $prefix) {
            if (str_starts_with($path, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /** @return array<string, int> path → size, for everything under $prefix */
    private function sizes(Filesystem $disk, string $prefix): array
    {
        $out = [];
        foreach ($disk->allFiles(rtrim($prefix, '/')) as $path) {
            $out[$path] = $disk->size($path);
        }

        return $out;
    }

    private function copy(Filesystem $from, string $fromPath, Filesystem $to, string $toPath): void
    {
        $in = $from->readStream($fromPath);
        try {
            $to->writeStream($toPath, $in, ['visibility' => 'private']);
        } finally {
            is_resource($in) && fclose($in);
        }
    }

    /** @return array<string, string> */
    private function gone(): array
    {
        $local = Storage::disk('local');

        return $local->exists(self::GONE) ? (json_decode($local->get(self::GONE), true) ?: []) : [];
    }
}
