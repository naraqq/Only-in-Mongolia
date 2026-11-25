<?php

namespace Database\Seeders;

use App\Models\CreatorProfile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * Profile photos and covers for the demo accounts, from free Unsplash photos (credits in images/CREDITS.md).
 * The photos show each creator's subject, not people, so no real person stands in for a made-up creator.
 * Safe to run again; it only fills photos that are missing:  php artisan db:seed --class=DemoPhotosSeeder
 */
class DemoPhotosSeeder extends Seeder
{
    private const CREATORS = ['saraa.art', 'tuvshin_cooks', 'gobi.lens', 'temuulen.fit', 'naraa.music', 'bold.codes', 'khulan.style', 'erdene.travel', 'demo'];

    public function run(): void
    {
        foreach (self::CREATORS as $handle) {
            $creator = CreatorProfile::with('user')->where('handle', $handle)->first();
            if (! $creator) {
                continue;
            }
            $this->fill($creator->user, 'avatar_path', 'avatars', "avatar-{$handle}.jpg");
            $this->fill($creator, 'cover_path', 'covers', "cover-{$handle}.jpg");
        }

        if ($fan = User::where('phone', '99999999')->first()) {
            $this->fill($fan, 'avatar_path', 'avatars', 'avatar-fan.jpg');
            $this->fill($fan, 'cover_path', 'covers', 'cover-fan.jpg');
        }
    }

    private function fill(object $model, string $column, string $dir, string $file): void
    {
        if ($model->{$column} || ! is_file($source = __DIR__.'/images/'.$file)) {
            return;
        }
        $path = $dir.'/demo-'.$file;
        Storage::disk('public')->put($path, file_get_contents($source));
        $model->forceFill([$column => $path])->save();
    }
}
