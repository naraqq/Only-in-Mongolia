<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // How much of a post's video each viewer watched, per day (studio insights: plays, % watched, completion).
        Schema::create('video_watches', function (Blueprint $table) {
            $table->foreignId('post_media_id')->constrained('post_media')->cascadeOnDelete();
            $table->string('viewer', 48); // user id, or "s:" + a hash of the session for guests (like post_views)
            $table->date('day');
            $table->unsignedInteger('seconds')->default(0); // actually played (not skipped over)
            $table->unsignedTinyInteger('max_percent')->default(0); // furthest point reached
            $table->primary(['post_media_id', 'viewer', 'day']);
            $table->index(['post_media_id', 'day']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_watches');
    }
};
