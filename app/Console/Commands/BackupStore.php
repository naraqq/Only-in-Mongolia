<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * php artisan backup:store database/2026….sql.gz < file — keep a file from standard input in the backup bucket.
 * Used by deployment/scheduled-backup.sh to send each database backup off the server
 * (cat backup | docker compose exec -T app php artisan backup:store database/<name>).
 * --keep-days removes that folder's files older than this many days afterwards.
 */
class BackupStore extends Command
{
    protected $signature = 'backup:store {path : Where in the backup bucket, e.g. database/20261128T020000Z.sql.gz} {--keep-days=0 : Then remove files in the same folder older than this} {--file= : Read this file instead of standard input}';

    protected $description = 'Store standard input in the backup bucket (off-site database backups)';

    public function handle(): int
    {
        if (! config('filesystems.disks.backup.bucket')) {
            $this->warn('No backup bucket (BACKUP_BUCKET): not stored.');

            return self::SUCCESS;
        }
        $path = ltrim((string) $this->argument('path'), '/');
        if (! preg_match('#^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$#', $path) || str_starts_with($path, 'media/')) {
            $this->error('Give a plain path outside media/, like database/backup.sql.gz.');

            return self::FAILURE;
        }
        $in = fopen($this->option('file') ?: 'php://stdin', 'rb');
        if (! $in) {
            $this->error('Cannot read the input.');

            return self::FAILURE;
        }
        $disk = Storage::disk('backup');
        $disk->writeStream($path, $in, ['visibility' => 'private']);
        fclose($in);
        $size = $disk->size($path);
        if ($size === 0) {
            $disk->delete($path);
            $this->error('Nothing arrived on standard input.');

            return self::FAILURE;
        }
        $this->info(sprintf('Stored %s (%.1f MB).', $path, $size / 1048576));

        $keep = (int) $this->option('keep-days');
        if ($keep > 0) {
            $folder = dirname($path);
            $cutoff = now()->subDays($keep)->getTimestamp();
            foreach ($disk->files($folder === '.' ? '' : $folder) as $file) {
                if ($file !== $path && $disk->lastModified($file) < $cutoff) {
                    $disk->delete($file);
                }
            }
        }

        return self::SUCCESS;
    }
}
