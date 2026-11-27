<?php

namespace App\Models;

use App\Media\Previews;
use App\Media\Stamp;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Message extends Model
{
    protected $fillable = ['conversation_id', 'sender_id', 'body', 'is_mass', 'tip_amount', 'price', 'kind'];

    protected $casts = ['is_mass' => 'boolean', 'tip_amount' => 'integer', 'price' => 'integer'];

    /** The sender always sees their media; the recipient only after paying, if there's a price. */
    public function isUnlockedFor(User $viewer): bool
    {
        return ! $this->price || $viewer->id === $this->sender_id || Purchase::hasMessage($viewer, $this);
    }

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

    /** What the chat window shows $viewer. Locked pay-per-view media only reveals how many photos/videos there are. */
    public function present(User $viewer): array
    {
        $locked = ! $this->isUnlockedFor($viewer);
        $stamp = $locked ? null : Stamp::forMessage($this, $viewer);
        $tag = $stamp ? ['s' => Stamp::urlTag($viewer)] : [];

        return [
            'id' => $this->id,
            'sender_id' => $this->sender_id,
            'body' => $this->body,
            'tip_amount' => $this->tip_amount,
            'price' => $this->price,
            'locked' => $locked,
            'created_at' => $this->created_at->toIso8601String(),
            'counts' => ['image' => $this->media->where('type', 'image')->count(), 'video' => $this->media->where('type', 'video')->count(), 'audio' => $this->media->where('type', 'audio')->count()],
            'media' => $locked ? [] : $this->presentMedia($tag, $stamp),
        ];
    }

    /** The files, videos with their still and seek-bar frames when they have them (App\Media\Previews). */
    private function presentMedia(array $tag, ?string $stamp): array
    {
        $previews = Previews::forPaths($this->media->where('type', 'video')->pluck('path'));

        return $this->media->map(fn (MessageMedia $m) => [
            'id' => $m->id,
            'type' => $m->type,
            'url' => route('messages.media', [$m, ...$tag]),
            'stamp' => $stamp,
            ...($m->type === 'video' ? Previews::present($previews[$m->path] ?? null, fn (string $which) => $which === 'hls' ? route('messages.media.hls', [$m, 'master.m3u8']) : route('messages.media.preview', [$m, $which])) : []),
        ])->all();
    }
}
