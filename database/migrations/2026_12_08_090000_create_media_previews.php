<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A video's still frame and seek-bar frames (App\Media\Previews), made in the browser when it's uploaded.
        // Keyed by the video's stored path, since one file can be in several posts, messages and the library.
        Schema::create('media_previews', function (Blueprint $table) {
            $table->id();
            $table->string('path')->unique(); // the video's path on the media disk
            $table->string('poster_path')->nullable();
            $table->string('thumbs_path')->nullable();
            // Seek-bar frames: one image, a grid of `cols` columns of w×h tiles, one every `interval` seconds.
            $table->json('thumbs')->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->decimal('duration', 10, 3)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_previews');
    }
};
