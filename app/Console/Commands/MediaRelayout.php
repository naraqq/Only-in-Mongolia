<?php

namespace App\Console\Commands;

use App\Jobs\DeleteMovedFile;
use App\Media\Files;
use App\Media\Paths;
use App\Media\Transcoding;
use App\Models\CreatorProfile;
use App\Models\MediaPreview;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * php artisan media:relayout — move files stored before the current layout (posts/{creatorId}/…, uploads/{userId}/…,
 * creator-ids/{userId}/…) to users/{userId}/{purpose}/{yyyy}/{mm}/… and kyc/{userId}/… (App\Media\Paths).
 *
 * Each file is copied to its new path on the media disk (so with MEDIA_DISK=r2 this also uploads local files to
 * the bucket), every row using it is switched over in one transaction, and the old file is removed ten minutes
 * later (App\Jobs\DeleteMovedFile), so a page loaded just before still works. Safe to run again: files already
 * in the layout are skipped. --transcode also queues conversion (and frames) for the videos it moves.
 */
class MediaRelayout extends Command
{
    protected $signature = 'media:relayout {--dry-run : Only show what would move} {--transcode : Also convert the moved videos for the web} {--limit=0 : Move at most this many files}';

    protected $description = 'Move files stored in the old folder layout to users/{id}/… and kyc/{id}/…';

    /** Who owns a file and what it's for, from the first table that uses it: [userId, purpose, created_at, type]. */
    private function owner(string $path): ?array
    {
        $post = DB::table('post_media')->join('posts', 'posts.id', '=', 'post_media.post_id')
            ->join('creator_profiles', 'creator_profiles.id', '=', 'posts.creator_profile_id')
            ->where('post_media.path', $path)->orderBy('post_media.id')
            ->first(['creator_profiles.user_id', 'post_media.created_at', 'post_media.type']);
        if ($post) {
            return [(int) $post->user_id, Paths::POSTS, $post->created_at, $post->type];
        }
        $message = DB::table('message_media')->join('messages', 'messages.id', '=', 'message_media.message_id')
            ->where('message_media.path', $path)->orderBy('message_media.id')
            ->first(['messages.sender_id', 'message_media.created_at', 'message_media.type']);
        if ($message) {
            return [(int) $message->sender_id, Paths::MESSAGES, $message->created_at, $message->type];
        }
        $item = DB::table('vault_items')->join('creator_profiles', 'creator_profiles.id', '=', 'vault_items.creator_profile_id')
            ->where('vault_items.path', $path)->orderBy('vault_items.id')
            ->first(['creator_profiles.user_id', 'vault_items.created_at', 'vault_items.type']);
        if ($item) {
            return [(int) $item->user_id, Paths::LIBRARY, $item->created_at, $item->type];
        }
        $upload = DB::table('media_uploads')->where('path', $path)->first(['user_id', 'created_at', 'type']);

        return $upload ? [(int) $upload->user_id, Paths::POSTS, $upload->created_at, $upload->type] : null;
    }

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $limit = (int) $this->option('limit');
        $paths = collect(['post_media', 'message_media', 'vault_items', 'media_uploads'])
            ->flatMap(fn ($t) => DB::table($t)->whereNotNull('path')->pluck('path'))
            ->unique()->reject(fn ($p) => Paths::current($p))->values();
        if ($limit > 0) {
            $paths = $paths->take($limit);
        }
        $this->info(($dry ? '[dry run] ' : '')."{$paths->count()} file(s) to move to the current layout.");

        $moved = 0;
        $failed = 0;
        foreach ($paths as $path) {
            $owner = $this->owner($path);
            if (! $owner) {
                continue;
            }
            [$userId, $purpose, $at, $type] = $owner;
            $ext = pathinfo(Paths::isWeb($path) ? substr($path, 0, -8) : $path, PATHINFO_EXTENSION) ?: 'bin';
            $target = Paths::media($userId, $purpose, $ext, Carbon::parse($at));
            if (Paths::isWeb($path)) {
                $target = Paths::web(preg_replace('/\.[^.\/]+$/', '.mp4', $target));
            }
            $this->line("  {$path} → {$target}");
            if ($dry) {
                continue;
            }
            try {
                $this->move($path, $target);
                if ($this->option('transcode') && $type === 'video') {
                    Transcoding::queue($target);
                }
                $moved++;
            } catch (Throwable $e) {
                $failed++;
                $this->error("    failed: {$e->getMessage()}");
            }
        }

        $moved += $this->kyc($dry);
        $this->info(($dry ? '[dry run] ' : '')."Moved {$moved} file(s)".($failed ? ", {$failed} failed (run again to retry)" : '').'.');

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    /** Copy, switch every row (and the video's frames) over, and remove the old copy later. */
    private function move(string $from, string $to): void
    {
        $this->copy($from, $to);
        $preview = MediaPreview::where('path', $from)->first();
        $old = array_values(array_filter([$from, $preview?->poster_path, $preview?->thumbs_path])); // before they're switched
        $frames = [];
        if ($preview) {
            foreach (['poster_path' => Paths::poster($to), 'thumbs_path' => Paths::thumbs($to)] as $column => $new) {
                if ($preview->{$column} && Files::exists($preview->{$column})) {
                    $this->copy($preview->{$column}, $new);
                    $frames[$column] = $new;
                }
            }
            // Its streaming playlists and pieces (App\Media\Hls) move along, file by file.
            if ($preview->hls_path) {
                $fromDir = dirname($preview->hls_path);
                $toDir = Paths::hls($to);
                foreach (Files::disk($preview->hls_path)->allFiles($fromDir) as $piece) {
                    $this->copy($piece, $toDir.substr($piece, strlen($fromDir)));
                    $old[] = $piece;
                }
                $frames['hls_path'] = "{$toDir}/master.m3u8";
            }
        }

        DB::transaction(function () use ($from, $to, $preview, $frames) {
            foreach (['media_uploads', 'vault_items', 'post_media', 'message_media'] as $table) {
                DB::table($table)->where('path', $from)->update(['path' => $to]);
            }
            $preview?->update(['path' => $to, ...$frames]);
        });

        DeleteMovedFile::dispatch($from, $to, $old)->delay(now()->addMinutes(10));
    }

    /** ID documents: creator-ids/{id}/… → kyc/{id}/{ulid}-{front|back|selfie}.ext */
    private function kyc(bool $dry): int
    {
        $moved = 0;
        $columns = ['id_front_path' => 'front', 'id_back_path' => 'back', 'selfie_path' => 'selfie'];
        CreatorProfile::query()->each(function (CreatorProfile $c) use ($columns, $dry, &$moved) {
            foreach ($columns as $column => $label) {
                $from = (string) $c->{$column};
                if ($from === '' || Paths::current($from) || ! Files::exists($from)) {
                    continue;
                }
                $to = Paths::kyc($c->user_id, $label, pathinfo($from, PATHINFO_EXTENSION) ?: 'jpg');
                $this->line("  {$from} → {$to}");
                if ($dry) {
                    continue;
                }
                $this->copy($from, $to);
                $c->forceFill([$column => $to])->saveQuietly();
                DeleteMovedFile::dispatch($from, $to, [$from])->delay(now()->addMinutes(10));
                $moved++;
            }
        });

        return $moved;
    }

    /** Stream a file from wherever it is now to $to on the media disk. */
    private function copy(string $from, string $to): void
    {
        $in = Files::disk($from)->readStream($from);
        if (! $in) {
            throw new \RuntimeException("Can't read {$from}.");
        }
        try {
            Files::disk()->writeStream($to, $in, ['visibility' => 'private']);
        } finally {
            is_resource($in) && fclose($in);
        }
        if (! Files::disk()->exists($to)) {
            throw new \RuntimeException("Copy to {$to} didn't arrive.");
        }
    }
}
