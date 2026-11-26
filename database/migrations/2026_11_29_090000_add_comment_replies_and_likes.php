<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Replies are one level deep: a reply points at a top-level comment, and goes when it goes.
        Schema::table('post_comments', function (Blueprint $table) {
            $table->foreignId('parent_id')->nullable()->after('user_id')->constrained('post_comments')->cascadeOnDelete();
        });

        Schema::create('comment_likes', function (Blueprint $table) {
            $table->foreignId('post_comment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['post_comment_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_likes');
        Schema::table('post_comments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_id');
        });
    }
};
