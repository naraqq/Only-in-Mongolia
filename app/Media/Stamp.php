<?php

namespace App\Media;

use App\Models\Message;
use App\Models\Post;
use App\Models\User;
use GdImage;
use Illuminate\Support\Facades\Storage;

/**
 * Paid and private photos carry the viewer's ID, faintly, across the whole picture. If a photo leaks,
 * the stamp says whose account it came from. Videos get the same text as an overlay in the player
 * (burning it into the file would need ffmpeg).
 *
 * Stamped copies are made the first time someone opens a photo and kept under storage/app/private/stamped,
 * one folder per original; `media:prune-stamps` clears copies nobody has opened for a while.
 */
class Stamp
{
    /** Longest side of a stamped copy. Large enough for any screen, and keeps memory and file size in check. */
    private const MAX_SIDE = 2560;

    /** Bump to rebuild every cached copy after changing how the stamp looks. */
    private const VERSION = 'v2';

    /** What gets written on the picture: who is looking, as their @handle and account ID (never a phone number or name). */
    public static function text(User $viewer): string
    {
        $handle = $viewer->creatorProfile?->handle;

        return preg_replace('/[^\x20-\x7E]/', '', ($handle ? '@'.$handle.' - ' : '').'ID '.$viewer->id);
    }

    /** Post media is stamped unless the post is free for everyone, or the viewer is its creator or an admin. */
    public static function forPost(Post $post, ?User $viewer): ?string
    {
        if (! $viewer || $viewer->is_admin || $viewer->id === $post->creator->user_id) {
            return null;
        }

        return $post->price || $post->visibility !== Post::PUBLIC ? self::text($viewer) : null;
    }

    /** Message photos are private by nature: everyone but the sender sees them stamped. */
    public static function forMessage(Message $message, User $viewer): ?string
    {
        return $viewer->is_admin || $viewer->id === $message->sender_id ? null : self::text($viewer);
    }

    /** A short per-viewer tag for the URL, so a shared browser never shows one person's copy to another from its cache. */
    public static function urlTag(User $viewer): string
    {
        return substr(hash_hmac('sha256', (string) $viewer->id, (string) config('app.key')), 0, 10);
    }

    public static function folder(string $sourcePath): string
    {
        return 'stamped/'.sha1($sourcePath);
    }

    /** The stamped copy of a stored photo (made now if needed). Returns its absolute path, always a JPEG. */
    public function image(string $sourcePath, string $text): string
    {
        // Stored files never change (each upload gets a new random name), so the path identifies the version.
        $local = Storage::disk('local');
        $file = self::folder($sourcePath).'/'.substr(sha1($text.'|'.$sourcePath.'|'.self::VERSION), 0, 24).'.jpg';
        if ($local->exists($file)) {
            touch($local->path($file)); // still in use; keep it past the next prune

            return $local->path($file);
        }

        $img = $this->load(Files::localPath($sourcePath));
        $this->stamp($img, $text);

        $local->makeDirectory(dirname($file));
        $tmp = $local->path($file).'.'.bin2hex(random_bytes(4)).'.tmp';
        imagejpeg($img, $tmp, 86);
        imagedestroy($img);
        rename($tmp, $local->path($file)); // atomic: two people opening it at once never see half a file

        return $local->path($file);
    }

    /** The photo upright (phones store rotation separately), on white (for transparent PNGs), at most MAX_SIDE. */
    private function load(string $path): GdImage
    {
        $src = @imagecreatefromstring((string) file_get_contents($path));
        if (! $src) {
            throw new \RuntimeException('Not an image: '.basename($path));
        }

        if (function_exists('exif_read_data') && @exif_imagetype($path) === IMAGETYPE_JPEG) {
            $angle = match ((int) (@exif_read_data($path)['Orientation'] ?? 1)) {
                3 => 180, 6 => -90, 8 => 90, default => 0,
            };
            if ($angle) {
                $src = imagerotate($src, $angle, 0);
            }
        }

        [$w, $h] = [imagesx($src), imagesy($src)];
        $scale = min(1, self::MAX_SIDE / max($w, $h));
        [$nw, $nh] = [max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale))];

        $out = imagecreatetruecolor($nw, $nh);
        imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
        imagecopyresampled($out, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($src);

        return $out;
    }

    /** Diagonal rows of faint text over the whole picture, so it can't simply be cropped off. */
    private function stamp(GdImage $img, string $text): void
    {
        [$w, $h] = [imagesx($img), imagesy($img)];
        $tile = $this->textTile($text, max(13, (int) round(min($w, $h) * 0.03)));
        $tile = imagerotate($tile, 24, imagecolorallocatealpha($tile, 0, 0, 0, 127));
        imagesavealpha($tile, true);
        [$tw, $th] = [imagesx($tile), imagesy($tile)];

        imagealphablending($img, true);
        $stepX = (int) max($tw * 1.6, $w / 2.2);
        $stepY = (int) max($th * 1.2, $h / 2.6);
        for ($row = 0, $y = -$th / 2; $y < $h; $row++, $y += $stepY) {
            for ($x = ($row % 2) ? -$tw / 2 : -$tw / 8; $x < $w; $x += $stepX) {
                imagecopy($img, $tile, (int) $x, (int) $y, 0, 0, $tw, $th);
            }
        }
        imagedestroy($tile);
    }

    /**
     * The text, light with a soft dark edge so it reads on bright and dark photos alike. GD's built-in font
     * (no font file to ship) is drawn small and scaled up.
     */
    private function textTile(string $text, int $height): GdImage
    {
        $font = 5;
        [$cw, $ch] = [imagefontwidth($font) * strlen($text) + 2, imagefontheight($font) + 2];
        $small = $this->transparent($cw, $ch);
        $shadow = imagecolorallocatealpha($small, 0, 0, 0, 108);
        foreach ([[0, 1], [2, 1], [1, 0], [1, 2]] as [$dx, $dy]) {
            imagestring($small, $font, $dx, $dy, $text, $shadow);
        }
        imagestring($small, $font, 1, 1, $text, imagecolorallocatealpha($small, 255, 255, 255, 76));

        $scale = $height / $ch;
        $big = $this->transparent((int) round($cw * $scale), $height);
        imagecopyresampled($big, $small, 0, 0, 0, 0, imagesx($big), $height, $cw, $ch);
        imagedestroy($small);

        return $big;
    }

    private function transparent(int $w, int $h): GdImage
    {
        $im = imagecreatetruecolor($w, $h);
        imagealphablending($im, false);
        imagefill($im, 0, 0, imagecolorallocatealpha($im, 0, 0, 0, 127));
        imagesavealpha($im, true);

        return $im;
    }
}
