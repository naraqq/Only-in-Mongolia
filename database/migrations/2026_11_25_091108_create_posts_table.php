<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Creator posts and their media. Media files live on the private disk and are only served after a permission check. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->text('body')->nullable();
            $table->string('visibility', 16)->default('subscribers'); // public | subscribers
            $table->boolean('is_adult')->default(false); // 18+: never shown to signed-out visitors
            $table->timestamps();
            $table->index(['creator_profile_id', 'created_at']);
        });

        Schema::create('post_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('post_id')->constrained()->cascadeOnDelete();
            $table->string('type', 8); // image | video
            $table->string('path');
            $table->string('mime', 64);
            $table->unsignedTinyInteger('position')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_media');
        Schema::dropIfExists('posts');
    }
};
