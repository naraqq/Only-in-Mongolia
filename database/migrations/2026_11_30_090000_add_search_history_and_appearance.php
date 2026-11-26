<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Recent searches, kept on the account (so they follow you between devices and can be cleared).
        Schema::create('search_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('query', 100);
            $table->timestamp('searched_at');
            $table->unique(['user_id', 'query']);
            $table->index(['user_id', 'searched_at']);
        });

        // Light, dark or follow the device (null).
        Schema::table('users', function (Blueprint $table) {
            $table->string('appearance', 6)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('appearance'));
        Schema::dropIfExists('search_histories');
    }
};
