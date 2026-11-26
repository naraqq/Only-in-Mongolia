<?php

namespace Database\Seeders;

use App\Models\Post;
use App\Models\User;
use Illuminate\Database\Seeder;

/** Demo likes and comments on posts, so the feed looks alive. Safe to run again (skips posts that already have likes). */
class DemoEngagementSeeder extends Seeder
{
    private const COMMENTS = ['Гоё байна! 😍', 'Үнэхээр гайхалтай', 'Баярлалаа, хүлээж байсан юм', 'Дараагийнхыг хүлээж байна 🔥', 'Wow 👏', 'Хаана авсан зураг вэ?'];

    public function run(?array $creatorIds = null, ?array $fanIds = null): void
    {
        $fans = $fanIds === null ? User::whereNull('phone')->whereDoesntHave('creatorProfile')->pluck('id') : collect($fanIds);
        if ($fans->isEmpty()) {
            return;
        }

        Post::whereDoesntHave('likes')->when($creatorIds !== null, fn ($query) => $query->whereIn('creator_profile_id', $creatorIds))
            ->get()->each(function (Post $post) use ($fans) {
            $post->likes()->attach($fans->random(min($fans->count(), random_int(2, 18)))->all());
            foreach ($fans->random(min($fans->count(), random_int(0, 3))) as $i => $userId) {
                $post->comments()->create(['user_id' => $userId, 'body' => self::COMMENTS[($post->id + $i) % count(self::COMMENTS)]]);
            }
        });
    }
}
