<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // What a creator's page is about (up to two, from config creators.categories): Discover filters by it,
        // suggestions and the starter feed use it.
        Schema::table('creator_profiles', function (Blueprint $table) {
            $table->json('categories')->nullable()->after('bio');
        });
        // The starter feed's hand-picked topics become those creators' categories.
        foreach ((array) config('starter-feed.topics_by_handle') as $handle => $topic) {
            DB::table('creator_profiles')->where('handle', $handle)->whereNull('categories')->update(['categories' => json_encode([$topic])]);
        }
    }

    public function down(): void
    {
        Schema::table('creator_profiles', fn (Blueprint $table) => $table->dropColumn('categories'));
    }
};
