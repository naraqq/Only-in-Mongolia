<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class CreatorSeries extends Model
{
    protected $table = 'creator_series';

    protected $fillable = ['title', 'description', 'featured'];

    protected $casts = ['featured' => 'boolean'];

    public function posts(): BelongsToMany
    {
        return $this->belongsToMany(Post::class, 'creator_series_posts')->withPivot('position')->orderByPivot('position');
    }
}
