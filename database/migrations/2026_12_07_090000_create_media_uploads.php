<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Large files (videos up to a few GB) arrive in small pieces before the post is published; see App\Media\ChunkedUploads.
        Schema::create('media_uploads', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedBigInteger('size');
            $table->unsignedInteger('chunk_size');
            $table->unsignedInteger('chunks');
            $table->string('type', 10)->nullable(); // image | video | audio, once finished
            $table->string('mime')->nullable();
            $table->string('path')->nullable(); // on the media disk, once finished
            $table->char('sha256', 64)->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('attached_at')->nullable(); // used by a post (the file now belongs to it)
            $table->timestamps();
            $table->index(['user_id', 'completed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_uploads');
    }
};
