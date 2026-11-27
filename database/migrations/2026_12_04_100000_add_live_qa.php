<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A Q&A post: fans ask and upvote questions, the creator answers them live between these times.
        Schema::table('posts', function (Blueprint $table) {
            $table->timestamp('qa_starts_at')->nullable();
            $table->timestamp('qa_ends_at')->nullable();
            $table->timestamp('qa_announced_at')->nullable(); // "it's live" sent to the fans who asked to be reminded
        });

        // "Remind me": the demand signal for a Q&A, and who hears when it starts.
        Schema::create('qa_rsvps', function (Blueprint $table) {
            $table->foreignId('post_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->primary(['post_id', 'user_id']);
        });

        Schema::create('qa_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('post_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('body', 300);
            $table->unsignedInteger('votes_count')->default(0);
            $table->text('answer')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->timestamp('hidden_at')->nullable(); // the creator took it off the list
            $table->timestamps();
            $table->index(['post_id', 'hidden_at']);
        });

        Schema::create('qa_question_votes', function (Blueprint $table) {
            $table->foreignId('qa_question_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->primary(['qa_question_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qa_question_votes');
        Schema::dropIfExists('qa_questions');
        Schema::dropIfExists('qa_rsvps');
        Schema::table('posts', function (Blueprint $table) {
            $table->dropColumn(['qa_starts_at', 'qa_ends_at', 'qa_announced_at']);
        });
    }
};
