<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('creator_series', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->string('title', 100);
            $table->string('description', 500)->nullable();
            $table->boolean('featured')->default(false);
            $table->timestamps();
        });
        Schema::create('creator_series_posts', function (Blueprint $table) {
            $table->foreignId('creator_series_id')->constrained('creator_series')->cascadeOnDelete();
            $table->foreignId('post_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('position');
            $table->primary(['creator_series_id', 'post_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_series_posts');
        Schema::dropIfExists('creator_series');
    }
};
