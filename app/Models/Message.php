<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Message extends Model
{
    protected $fillable = ['conversation_id', 'sender_id', 'body', 'is_mass', 'tip_amount'];

    protected $casts = ['is_mass' => 'boolean', 'tip_amount' => 'integer'];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function media(): HasMany
    {
        return $this->hasMany(MessageMedia::class)->orderBy('position');
    }

    /** What the chat window shows. */
    public function present(): array
    {
        return [
            'id' => $this->id,
            'sender_id' => $this->sender_id,
            'body' => $this->body,
            'tip_amount' => $this->tip_amount,
            'created_at' => $this->created_at->toIso8601String(),
            'media' => $this->media->map(fn (MessageMedia $m) => ['id' => $m->id, 'type' => $m->type, 'url' => route('messages.media', $m)])->all(),
        ];
    }
}
