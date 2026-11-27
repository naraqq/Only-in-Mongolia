<?php

namespace App\Console\Commands;

use App\Media\Files;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

/**
 * php artisan media:check — prove the media disk works end to end: write a small file, read it back through a
 * signed link (what browsers get), and delete it. Run it after setting the R2 keys, before switching MEDIA_DISK.
 */
class MediaCheck extends Command
{
    protected $signature = 'media:check {--disk= : Disk to check (default: the media disk)}';

    protected $description = 'Check that the media disk (e.g. Cloudflare R2) can store, sign and serve files';

    public function handle(): int
    {
        $name = $this->option('disk') ?: Files::diskName();
        config(['filesystems.media_disk' => $name]);
        $path = 'health/'.Str::random(16).'.txt';
        $body = 'only-in-mongolia '.now()->toIso8601String();

        try {
            $this->line("Disk: {$name}".(Files::remote() ? ' (bucket)' : ' (this server)'));
            Files::put($path, $body);
            $this->info('✓ wrote a test file');
            abort_unless(Files::exists($path), 500, 'The file was written but can’t be found.');
            $this->info('✓ found it again');
            if (Files::remote()) {
                $url = Files::disk()->temporaryUrl($path, now()->addMinutes(2));
                $got = Http::timeout(15)->get($url);
                if (! $got->successful() || $got->body() !== $body) {
                    $this->error("✗ the signed link didn't work (HTTP {$got->status()}). Check the endpoint and that the keys can read.");

                    return self::FAILURE;
                }
                $this->info('✓ downloaded it through a signed link (what browsers get)');
                $public = rtrim((string) config("filesystems.disks.{$name}.endpoint"), '/').'/'.config("filesystems.disks.{$name}.bucket").'/'.$path;
                if (Http::timeout(15)->get($public)->successful()) {
                    $this->warn('! the file is also readable WITHOUT a signed link: make the bucket private.');
                }
            }
            Files::delete($path);
            $this->info('✓ deleted it');
        } catch (Throwable $e) {
            $this->error('✗ '.$e->getMessage());

            return self::FAILURE;
        }
        $this->info('The media disk works.');

        return self::SUCCESS;
    }
}
