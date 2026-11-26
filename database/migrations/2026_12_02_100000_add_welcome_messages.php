<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The creator's automatic welcome DM for new subscribers: text, optional photos/videos from the library,
        // optionally locked behind a price.
        Schema::table('creator_profiles', function (Blueprint $table) {
            $table->boolean('welcome_enabled')->default(false);
            $table->text('welcome_body')->nullable();
            $table->json('welcome_vault')->nullable(); // library item ids, in order
            $table->unsignedInteger('welcome_price')->nullable();
        });

        // Automatic messages say what they were, for the creator's stats (welcome | winback).
        Schema::table('messages', function (Blueprint $table) {
            $table->string('kind', 16)->nullable()->after('is_mass');
        });

        // Each fan gets a creator's welcome once, even if they leave and come back.
        Schema::create('welcome_sends', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('message_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['creator_profile_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('welcome_sends');
        Schema::table('messages', fn (Blueprint $table) => $table->dropColumn('kind'));
        Schema::table('creator_profiles', fn (Blueprint $table) => $table->dropColumn(['welcome_enabled', 'welcome_body', 'welcome_vault', 'welcome_price']));
    }
};
