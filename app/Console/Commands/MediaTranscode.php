<?php

namespace App\Console\Commands;

use App\Jobs\TranscodeVideo;
use App\Media\Ffmpeg;
use App\Media\Transcoding;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * php artisan media:transcode — convert videos uploaded before conversion existed (or while ffmpeg was missing),
 * and give them what they lack: their still and seek-bar frames, and adaptive streaming for longer ones. New uploads are converted by themselves.
 */
class MediaTranscode extends Command
{
    protected $signature = 'media:transcode
        {path?* : Only these stored paths}
        {--now : Convert here and now, one by one, instead of queueing (shows progress)}';

    protected $description = 'Convert stored videos for the web (H.264 MP4) and make their frames';

    public function handle(Ffmpeg $ffmpeg): int
    {
        if (! $ffmpeg->available()) {
            $this->error('ffmpeg/ffprobe not found. Install ffmpeg, or set FFMPEG_PATH and FFPROBE_PATH.');

            return self::FAILURE;
        }

        $paths = collect($this->argument('path'));
        if ($paths->isEmpty()) {
            foreach (['post_media', 'message_media', 'vault_items'] as $table) {
                $paths = $paths->merge(DB::table($table)->where('type', 'video')->pluck('path'));
            }
        }
        // Already converted ones too: they're not converted again, but get whatever they lack (frames, streaming).
        $paths = $paths->unique()->values();
        $this->info("{$paths->count()} video(s) to convert.");

        foreach ($paths as $path) {
            if ($this->option('now')) {
                $this->line("→ {$path}");
                $started = microtime(true);
                try {
                    Transcoding::run($path, $ffmpeg);
                    $this->info(sprintf('  done in %.1f s', microtime(true) - $started));
                } catch (\Throwable $e) {
                    $this->error('  '.$e->getMessage());
                }
            } else {
                TranscodeVideo::dispatch($path);
            }
        }
        if (! $this->option('now') && $paths->isNotEmpty()) {
            $this->line('Queued. The media worker (php artisan queue:work media --queue=media) converts them.');
        }

        return self::SUCCESS;
    }
}
