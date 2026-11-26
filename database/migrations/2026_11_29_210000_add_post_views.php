<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per viewer per post per day: "seen" means at least half the post was on screen for a moment.
        Schema::create('post_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('post_id')->constrained()->cascadeOnDelete();
            $table->string('viewer', 64); // user id, or a hash of the session for visitors who aren't signed in
            $table->date('day');
            $table->unique(['post_id', 'viewer', 'day']);
            $table->index(['post_id', 'day']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_views');
    }
};
