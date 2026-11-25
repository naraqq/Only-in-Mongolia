<?php

namespace Database\Seeders;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/** Demo pay-per-view: one paid post from @saraa.art and a paid photo in her chat with Demo Fan. Safe to run again. */
class DemoPayPerViewSeeder extends Seeder
{
    public function run(): void
    {
        $saraa = CreatorProfile::where('handle', 'saraa.art')->first();
        $fan = User::where('phone', '99999999')->first();
        if (! $saraa || ! $fan) {
            return;
        }

        // Her post with the most photos becomes pay-per-view.
        $post = $saraa->posts()->withCount('media')->orderByDesc('media_count')->first();
        if ($post && ! $post->price) {
            $post->update(['price' => 15000, 'body' => 'Бүрэн цуврал: “Талын салхи”, өндөр нягтралтай 🎨']);
        }

        $conversation = Conversation::findBetween($fan, $saraa->user);
        $photo = $post?->media()->first();
        if (! $conversation || ! $photo || $conversation->messages()->whereNotNull('price')->exists()) {
            return;
        }
        $path = "messages/{$saraa->user_id}/demo-ppv.jpg";
        Storage::copy($photo->path, $path);
        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $saraa->user_id,
            'body' => 'Зөвхөн танд зориулсан шинэ зураг ✨',
            'price' => 5000,
        ]);
        $message->media()->create(['type' => 'image', 'path' => $path, 'mime' => 'image/jpeg', 'position' => 0]);
        $conversation->forceFill(['last_message_at' => now()])->saveQuietly();
    }
}
