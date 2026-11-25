<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('avatar_path')->nullable(); // public disk
        });

        Schema::table('creator_profiles', function (Blueprint $table) {
            $table->string('cover_path')->nullable(); // public disk
            // Who may start a conversation with this creator: everyone | followers | subscribers.
            $table->string('dm_policy', 12)->default('followers');
        });

        // A conversation between two people. user_low_id < user_high_id, so each pair has exactly one.
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_low_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('user_high_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('low_read_at')->nullable();
            $table->timestamp('high_read_at')->nullable();
            $table->timestamp('last_message_at')->nullable()->index();
            $table->timestamps();
            $table->unique(['user_low_id', 'user_high_id']);
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
            $table->text('body')->nullable();
            $table->boolean('is_mass')->default(false); // sent to all subscribers at once
            $table->timestamps();
            $table->index(['conversation_id', 'id']);
        });

        // Photos/videos in messages: private disk, only the two people in the conversation can open them.
        Schema::create('message_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->string('type', 10); // image | video
            $table->string('path');
            $table->string('mime', 60);
            $table->unsignedTinyInteger('position')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_media');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
        Schema::table('creator_profiles', fn (Blueprint $t) => $t->dropColumn(['cover_path', 'dm_policy']));
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('avatar_path'));
    }
};
