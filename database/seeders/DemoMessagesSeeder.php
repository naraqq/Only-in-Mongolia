<?php

namespace Database\Seeders;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\User;
use Illuminate\Database\Seeder;

/** Demo conversations for Demo Fan (99999999) with two creators. Safe to run again. */
class DemoMessagesSeeder extends Seeder
{
    public function run(): void
    {
        $fan = User::where('phone', '99999999')->first();
        if (! $fan) {
            return;
        }

        $chats = [
            'saraa.art' => [
                ['fan', 'Сайн байна уу! Таны “Талын салхи” цуврал үнэхээр гоё юм.', 50],
                ['creator', 'Баярлалаа 🙏 Энэ долоо хоногт дахиад 3 зураг нэмнэ.', 45],
                ['fan', 'Хэвлэмэл хувилбар зарах уу?', 30],
                ['creator', 'Тийм ээ, удахгүй захиалагчдад эхэлж санал болгоно!', 5],
            ],
            'gobi.lens' => [
                ['creator', 'Захиалсанд баярлалаа! Raw файлууд захиалагчдад үнэгүй шүү 📷', 120],
            ],
        ];

        foreach ($chats as $handle => $lines) {
            $creator = CreatorProfile::where('handle', $handle)->first();
            if (! $creator || Conversation::findBetween($fan, $creator->user)?->messages()->exists()) {
                continue;
            }
            $conversation = Conversation::between($fan, $creator->user);
            foreach ($lines as [$who, $body, $minutesAgo]) {
                $message = $conversation->messages()->create(['sender_id' => $who === 'fan' ? $fan->id : $creator->user_id, 'body' => $body]);
                $message->forceFill(['created_at' => now()->subMinutes($minutesAgo)])->saveQuietly();
            }
            $conversation->forceFill(['last_message_at' => now()->subMinutes(end($lines)[2])])->saveQuietly();
        }
    }
}
