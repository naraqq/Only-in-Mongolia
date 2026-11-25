<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** One conversation per pair of people (user_low_id < user_high_id). */
class Conversation extends Model
{
    protected $fillable = ['user_low_id', 'user_high_id', 'low_read_id', 'high_read_id', 'last_message_at'];

    protected $casts = ['last_message_at' => 'datetime'];

    /** The conversation between two people, created if it doesn't exist yet. */
    public static function between(User $a, User $b): self
    {
        [$low, $high] = $a->id < $b->id ? [$a->id, $b->id] : [$b->id, $a->id];

        return self::firstOrCreate(['user_low_id' => $low, 'user_high_id' => $high]);
    }

    public static function findBetween(User $a, User $b): ?self
    {
        [$low, $high] = $a->id < $b->id ? [$a->id, $b->id] : [$b->id, $a->id];

        return self::where(['user_low_id' => $low, 'user_high_id' => $high])->first();
    }

    public function scopeFor(Builder $q, User $user): Builder
    {
        return $q->where(fn ($w) => $w->where('user_low_id', $user->id)->orWhere('user_high_id', $user->id));
    }

    public function includes(User $user): bool
    {
        return $this->user_low_id === $user->id || $this->user_high_id === $user->id;
    }

    public function otherId(User $me): int
    {
        return $this->user_low_id === $me->id ? $this->user_high_id : $this->user_low_id;
    }

    public function readIdFor(User $me): int
    {
        return (int) ($this->user_low_id === $me->id ? $this->low_read_id : $this->high_read_id);
    }

    /** Remember that $me has seen everything up to the newest message. */
    public function markRead(User $me): void
    {
        $latest = (int) $this->messages()->max('id');
        $column = $this->user_low_id === $me->id ? 'low_read_id' : 'high_read_id';
        if ($latest > $this->{$column}) {
            $this->forceFill([$column => $latest])->saveQuietly();
        }
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function lastMessage(): HasOne
    {
        return $this->hasOne(Message::class)->latestOfMany();
    }

    public function low(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_low_id');
    }

    public function high(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_high_id');
    }

    /** Messages $user hasn't seen yet, across all their conversations. */
    public static function unreadCountFor(User $user): int
    {
        return self::unreadQuery($user)->count();
    }

    /** @return array<int, int> conversation id => unread messages */
    public static function unreadByConversation(User $user): array
    {
        return self::unreadQuery($user)->groupBy('messages.conversation_id')
            ->selectRaw('messages.conversation_id, count(*) as n')->pluck('n', 'conversation_id')->map(fn ($n) => (int) $n)->all();
    }

    private static function unreadQuery(User $user): Builder
    {
        return Message::query()
            ->join('conversations as c', 'c.id', '=', 'messages.conversation_id')
            ->where('messages.sender_id', '!=', $user->id)
            ->where(fn ($q) => $q
                ->where(fn ($w) => $w->where('c.user_low_id', $user->id)->whereColumn('messages.id', '>', 'c.low_read_id'))
                ->orWhere(fn ($w) => $w->where('c.user_high_id', $user->id)->whereColumn('messages.id', '>', 'c.high_read_id')));
    }
}
