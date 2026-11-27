<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Visits to a creator's pages (profile, series): one row per visitor per page per day.
        // `referrer` is how they got there: an outside site, a ?ref= tag, or a place in the app (see App\Support\Attribution).
        Schema::create('page_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->string('page', 16); // profile | series
            $table->unsignedBigInteger('page_id')->default(0); // the series id (0 for the profile)
            $table->string('viewer', 64); // user id, or a hash of the session for visitors who aren't signed in
            $table->string('referrer', 64);
            $table->date('day');
            $table->unique(['creator_profile_id', 'page', 'page_id', 'viewer', 'day']);
            $table->index(['creator_profile_id', 'day']);
        });

        // Where a follow came from: the page it was clicked on, the free post seen before it, and how the fan found the creator.
        Schema::table('follows', function (Blueprint $table) {
            $table->string('source', 16)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->foreignId('source_post_id')->nullable()->constrained('posts')->nullOnDelete();
            $table->string('referrer', 64)->nullable();
        });

        // The same for subscription payments (set when the fan starts checkout; renewals have none).
        Schema::table('payments', function (Blueprint $table) {
            $table->string('source', 16)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->string('referrer', 64)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn(['source', 'source_id', 'referrer']);
        });
        Schema::table('follows', function (Blueprint $table) {
            $table->dropConstrainedForeignId('source_post_id');
            $table->dropColumn(['source', 'source_id', 'referrer']);
        });
        Schema::dropIfExists('page_visits');
    }
};
