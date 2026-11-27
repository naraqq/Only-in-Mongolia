<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A creator's media library: every photo and video they uploaded, reusable in posts and messages.
        // Posts and messages point at the same stored file, so a file is only deleted once nothing uses it.
        Schema::create('vault_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->string('type', 8); // image | video
            $table->string('path');
            $table->string('mime', 64);
            $table->char('sha256', 64)->nullable();
            $table->timestamps();
            $table->unique(['creator_profile_id', 'path']);
            $table->index(['creator_profile_id', 'created_at']);
        });

        // What creators already uploaded is in their library from the start.
        $now = now();
        $postFiles = DB::table('post_media')->join('posts', 'posts.id', '=', 'post_media.post_id')
            ->select('posts.creator_profile_id', 'post_media.type', 'post_media.path', 'post_media.mime', 'post_media.sha256', 'post_media.created_at');
        $messageFiles = DB::table('message_media')->join('messages', 'messages.id', '=', 'message_media.message_id')
            ->join('creator_profiles', 'creator_profiles.user_id', '=', 'messages.sender_id')
            ->select('creator_profiles.id as creator_profile_id', 'message_media.type', 'message_media.path', 'message_media.mime', 'message_media.sha256', 'message_media.created_at');

        foreach (['post_media' => $postFiles, 'message_media' => $messageFiles] as $table => $query) {
            // Qualified: the joined tables have their own created_at.
            $query->orderBy("$table.created_at")->orderBy("$table.id")->chunk(500, function ($rows) use ($now) {
                DB::table('vault_items')->insertOrIgnore($rows->map(fn ($r) => [
                    'creator_profile_id' => $r->creator_profile_id, 'type' => $r->type, 'path' => $r->path, 'mime' => $r->mime,
                    'sha256' => $r->sha256, 'created_at' => $r->created_at ?? $now, 'updated_at' => $now,
                ])->all());
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('vault_items');
    }
};
