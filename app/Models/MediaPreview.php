<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A video's still frame and seek-bar frames. See App\Media\Previews. */
class MediaPreview extends Model
{
    protected $fillable = ['path', 'poster_path', 'thumbs_path', 'thumbs', 'width', 'height', 'duration'];

    protected function casts(): array
    {
        return ['thumbs' => 'array', 'width' => 'integer', 'height' => 'integer', 'duration' => 'float'];
    }
}
