<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Creator's bundle discounts in percent, by length: {"3": 10, "6": 15, "12": 25}. Missing or 0 = not offered.
        Schema::table('creator_profiles', function (Blueprint $table) {
            $table->json('bundles')->nullable();
        });

        // How many subscription periods a payment buys (1 for a plain month).
        Schema::table('payments', function (Blueprint $table) {
            $table->unsignedTinyInteger('months')->default(1);
        });
    }

    public function down(): void
    {
        Schema::table('payments', fn (Blueprint $table) => $table->dropColumn('months'));
        Schema::table('creator_profiles', fn (Blueprint $table) => $table->dropColumn('bundles'));
    }
};
