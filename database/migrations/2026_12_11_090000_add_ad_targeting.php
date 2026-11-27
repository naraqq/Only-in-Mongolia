<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ads', function (Blueprint $table) {
            // Where the banner shows: all | feed (home, feed, discover, search…) | creators (creators' pages).
            $table->string('placement', 10)->default('all')->after('allow_adult');
            // At most this many times a day for one viewer (null = no limit).
            $table->unsignedTinyInteger('frequency_cap')->nullable()->after('placement');
        });
    }

    public function down(): void
    {
        Schema::table('ads', fn (Blueprint $table) => $table->dropColumn(['placement', 'frequency_cap']));
    }
};
