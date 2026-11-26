<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A creator's own groups of fans ("VIP", "Close friends"), for targeted mass messages.
        Schema::create('fan_lists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->string('name', 40);
            $table->timestamps();
        });

        Schema::create('fan_list_members', function (Blueprint $table) {
            $table->foreignId('fan_list_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->primary(['fan_list_id', 'user_id']);
        });

        // The creator's private note about a fan (shown beside the chat).
        Schema::create('fan_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();
            $table->unique(['creator_profile_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fan_notes');
        Schema::dropIfExists('fan_list_members');
        Schema::dropIfExists('fan_lists');
    }
};
