<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One query someone searched for, with when they last searched it. */
class SearchHistory extends Model
{
    public $timestamps = false;

    /** How many are kept per person (only the newest few are shown). */
    public const KEEP = 20;

    public const SHOW = 6;

    protected $fillable = ['user_id', 'query', 'searched_at'];

    protected $casts = ['searched_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Remember $query as $user's latest search, and drop the oldest beyond KEEP. */
    public static function record(User $user, string $query): void
    {
        self::upsert([['user_id' => $user->id, 'query' => $query, 'searched_at' => now()]], ['user_id', 'query'], ['searched_at']);
        $stale = $user->searchHistories()->orderByDesc('searched_at')->skip(self::KEEP)->take(100)->pluck('id');
        if ($stale->isNotEmpty()) {
            self::whereIn('id', $stale)->delete();
        }
    }
}
