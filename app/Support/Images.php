<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Profile photos and covers: decoded and re-encoded with GD, which drops all metadata (GPS location,
 * camera details) and anything that isn't an image. Phone photos are rotated upright first.
 */
class Images
{
    /** Center-crop to $w x $h, save as JPEG on the public disk, return the path. */
    public static function storeCropped(UploadedFile $file, string $dir, int $w, int $h): string
    {
        $src = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));
        if (! $src) {
            throw new RuntimeException('Not a readable image.');
        }
        $src = self::upright($src, $file);

        [$sw, $sh] = [imagesx($src), imagesy($src)];
        $scale = max($w / $sw, $h / $sh);
        [$cw, $ch] = [(int) round($w / $scale), (int) round($h / $scale)];
        $dst = imagecreatetruecolor($w, $h);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255)); // transparent PNGs get a white background
        imagecopyresampled($dst, $src, 0, 0, (int) (($sw - $cw) / 2), (int) (($sh - $ch) / 2), $w, $h, $cw, $ch);

        ob_start();
        imagejpeg($dst, null, 85);
        $jpeg = (string) ob_get_clean();
        imagedestroy($src);
        imagedestroy($dst);

        $path = trim($dir, '/').'/'.Str::random(32).'.jpg';
        Storage::disk('public')->put($path, $jpeg);

        return $path;
    }

    private static function upright(\GdImage $img, UploadedFile $file): \GdImage
    {
        if ($file->getMimeType() !== 'image/jpeg' || ! function_exists('exif_read_data')) {
            return $img;
        }
        $orientation = (int) (@exif_read_data($file->getRealPath())['Orientation'] ?? 1);
        $angle = [3 => 180, 6 => -90, 8 => 90][$orientation] ?? 0;

        return $angle ? (imagerotate($img, $angle, 0) ?: $img) : $img;
    }
}
