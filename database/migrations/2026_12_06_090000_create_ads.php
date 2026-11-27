<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Sponsored banners other companies pay for (shown in the right-hand column, labelled "Sponsored").
        Schema::create('ads', function (Blueprint $table) {
            $table->id();
            $table->string('advertiser', 80);
            $table->string('title', 90);
            $table->string('body', 160)->nullable();
            $table->string('image_path');
            $table->string('url', 500);
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->boolean('active')->default(true);
            $table->unsignedTinyInteger('weight')->default(1); // how often it shows next to other running banners
            $table->boolean('allow_adult')->default(false); // also on 18+ creators' pages
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['active', 'starts_on', 'ends_on']);
        });

        // Views (on screen, once per visitor per day) and clicks, per banner per day: the advertiser's report.
        Schema::create('ad_stats', function (Blueprint $table) {
            $table->foreignId('ad_id')->constrained()->cascadeOnDelete();
            $table->date('day');
            $table->unsignedInteger('impressions')->default(0);
            $table->unsignedInteger('clicks')->default(0);
            $table->primary(['ad_id', 'day']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_stats');
        Schema::dropIfExists('ads');
    }
};
