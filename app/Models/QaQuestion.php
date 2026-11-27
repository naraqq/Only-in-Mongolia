<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** A fan's question in a live Q&A, with the creator's answer once given. */
class QaQuestion extends Model
{
    protected $fillable = ['post_id', 'user_id', 'body'];

    protected $casts = ['votes_count' => 'integer', 'answered_at' => 'datetime', 'hidden_at' => 'datetime'];

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function voters(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'qa_question_votes');
    }
}
