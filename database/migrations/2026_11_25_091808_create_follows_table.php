<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Free follows: a fan follows a creator to see their posts in the feed. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('follows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'creator_profile_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('follows');
    }
};
