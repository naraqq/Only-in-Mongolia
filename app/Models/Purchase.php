<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A pay-per-view post or message someone has unlocked. */
class Purchase extends Model
{
    protected $fillable = ['user_id', 'post_id', 'message_id', 'payment_id'];

    public static function hasPost(?User $user, Post $post): bool
    {
        return $user !== null && self::where('user_id', $user->id)->where('post_id', $post->id)->exists();
    }

    public static function hasMessage(?User $user, Message $message): bool
    {
        return $user !== null && self::where('user_id', $user->id)->where('message_id', $message->id)->exists();
    }
}
