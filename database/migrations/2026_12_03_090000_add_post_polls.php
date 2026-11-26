<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->json('poll_options')->nullable();
            $table->foreignId('poll_follow_up_id')->nullable()->constrained('posts')->nullOnDelete();
        });

        Schema::create('post_poll_votes', function (Blueprint $table) {
            $table->foreignId('post_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('option_index');
            $table->primary(['post_id', 'user_id']);
            $table->index(['post_id', 'option_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_poll_votes');
        Schema::table('posts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('poll_follow_up_id');
            $table->dropColumn('poll_options');
        });
    }
};
