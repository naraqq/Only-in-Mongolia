<?php

namespace App\Support;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\User;

/**
 * Who may message whom:
 * - anyone may message a creator if they meet the creator's setting (everyone / followers / subscribers);
 * - a creator may message their own followers and subscribers;
 * - once someone has messaged you, you may always reply to them.
 * Two fans who aren't creators can't message each other.
 */
class Messaging
{
    /** Null if $from may send to $to, otherwise why not: 'self' | 'follow' | 'subscribe' | 'closed'. */
    public static function whyNot(User $from, User $to): ?string
    {
        if ($from->id === $to->id) {
            return 'self';
        }
        if (Blocking::between($from, $to)) {
            return 'blocked';
        }

        // They wrote to you first: you can always answer.
        $conversation = Conversation::findBetween($from, $to);
        if ($conversation && $conversation->messages()->where('sender_id', $to->id)->exists()) {
            return null;
        }

        // You're a creator writing to one of your own fans.
        $mine = self::approvedCreator($from);
        if ($mine && ($mine->followers()->whereKey($to->id)->exists() || $mine->hasActiveSubscriber($to))) {
            return null;
        }

        // Writing to a creator: their setting decides.
        $theirs = self::approvedCreator($to);
        if (! $theirs) {
            return 'closed';
        }

        return match ($theirs->dm_policy) {
            'everyone' => null,
            'subscribers' => $theirs->hasActiveSubscriber($from) ? null : 'subscribe',
            default => $theirs->followers()->whereKey($from->id)->exists() || $theirs->hasActiveSubscriber($from) ? null : 'follow',
        };
    }

    private static function approvedCreator(User $user): ?CreatorProfile
    {
        return $user->creatorProfile()->where('status', CreatorProfile::APPROVED)->first();
    }
}
