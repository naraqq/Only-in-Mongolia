<?php

namespace Database\Seeders;

use App\Models\CreatorProfile;
use App\Models\PostMedia;
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

        $this->postPhotos();
    }

    /**
     * Swap the drawn placeholder pictures in demo posts for real photos: images/posts/<handle>-1.jpg, -2.jpg, ...
     * in the order the posts were written. Only files the demo seed created (".../demo-...") are touched.
     */
    private function postPhotos(): void
    {
        foreach (self::CREATORS as $handle) {
            $creator = CreatorProfile::where('handle', $handle)->first();
            if (! $creator) {
                continue;
            }
            $media = PostMedia::whereIn('post_id', $creator->posts()->reorder()->orderBy('id')->pluck('id'))
                ->where('path', 'like', "posts/{$creator->id}/demo-%")->orderBy('post_id')->orderBy('position')->get();
            foreach ($media as $i => $m) {
                $source = __DIR__."/images/posts/{$handle}-".($i + 1).'.jpg';
                if (is_file($source)) {
                    Storage::put($m->path, file_get_contents($source));
                }
            }
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
