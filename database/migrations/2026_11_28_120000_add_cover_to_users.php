<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Everyone can have a cover photo. Once someone becomes a creator, it moves to their creator page.
        Schema::table('users', function (Blueprint $table) {
            $table->string('cover_path')->nullable(); // public disk
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('cover_path'));
    }
};
