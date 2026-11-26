<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PostPollVote extends Model
{
    public $timestamps = false;

    protected $casts = ['option_index' => 'integer'];
}
