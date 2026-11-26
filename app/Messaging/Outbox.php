<?php

namespace App\Messaging;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\User;
use App\Push\Push;
use App\Push\SendPush;
use App\Push\Texts;
use Illuminate\Support\Facades\DB;

/** Putting a message into a conversation: by hand (the chat), in bulk (mass messages), or automatically (welcome, win-back). */
class Outbox
{
    /**
     * @param  array<int, array<string, mixed>>  $files  stored files (type, path, mime, sha256, scan_status?)
     */
    public static function deliver(Conversation $conversation, User $from, ?string $body, array $files, bool $mass = false, ?int $price = null, ?string $kind = null): Message
    {
        return DB::transaction(function () use ($conversation, $from, $body, $files, $mass, $price, $kind) {
            $message = $conversation->messages()->create([
                'sender_id' => $from->id,
                'body' => trim((string) $body) ?: null,
                'is_mass' => $mass,
                'price' => $files ? $price : null,
                'kind' => $kind,
            ]);
            foreach (array_values($files) as $i => $f) {
                $message->media()->create([...$f, 'scan_status' => $f['scan_status'] ?? 'pending', 'position' => $i]);
            }
            $conversation->forceFill(['last_message_at' => now()])->saveQuietly();

            return $message;
        });
    }

    /**
     * A push for the person who got the message: who sent it and the start of the text (a paid message only says
     * there's a photo or video). Mass messages don't push, so a creator's broadcast can't buzz thousands of phones.
     */
    public static function push(User $to, User $from, Message $message, Conversation $conversation): void
    {
        if (! Push::enabled()) {
            return;
        }
        $name = $from->creatorProfile()->where('status', CreatorProfile::APPROVED)->value('display_name') ?? $from->name;
        $body = $message->body && ! $message->price ? mb_strimwidth($message->body, 0, 140, '…') : null;
        SendPush::dispatch([$to->id], $body === null ? 'media' : 'message', ['name' => $name],
            route('messages.show', $conversation), 'chat-'.$conversation->id, $name, $body ?? Texts::line('media', $to->locale))->afterCommit();
    }
}
