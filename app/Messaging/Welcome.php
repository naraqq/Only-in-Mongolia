<?php

namespace App\Messaging;

use App\Media\Library;
use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * The creator's automatic welcome DM, sent the moment someone subscribes (paid or free trial).
 * Once per fan per creator, ever. It runs inside the payment's transaction, so it never throws:
 * a broken welcome must not undo a payment.
 */
class Welcome
{
    public static function send(CreatorProfile $creator, User $fan): void
    {
        if (! $creator->welcome_enabled || $creator->user_id === $fan->id) {
            return;
        }

        try {
            DB::transaction(function () use ($creator, $fan) {
                // Claim the send first: the unique key makes a second, simultaneous settle a no-op.
                $id = DB::table('welcome_sends')->insertGetId([
                    'creator_profile_id' => $creator->id, 'user_id' => $fan->id, 'created_at' => now(), 'updated_at' => now(),
                ]);

                try {
                    $files = Library::pick($creator, (array) $creator->welcome_vault);
                } catch (ValidationException) {
                    $files = []; // a picked file was removed or blocked since: send the words anyway
                }
                if (! $files && ! filled($creator->welcome_body)) {
                    return;
                }

                $conversation = Conversation::between($creator->user, $fan);
                $message = Outbox::deliver($conversation, $creator->user, $creator->welcome_body, $files, price: $creator->welcome_price, kind: 'welcome');
                $conversation->markRead($creator->user);
                DB::table('welcome_sends')->where('id', $id)->update(['message_id' => $message->id]);
                Outbox::push($fan, $creator->user, $message, $conversation);
            });
        } catch (UniqueConstraintViolationException) {
            // Already welcomed.
        } catch (Throwable $e) {
            report($e);
        }
    }
}
