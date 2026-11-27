<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Companies that advertise: one per signed-in person (the phone that runs it). See App\Http\Controllers\BusinessController.
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('register_number', 20); // улсын бүртгэлийн дугаар
            $table->string('email');
            $table->string('website', 300)->nullable();
            $table->string('logo_path')->nullable();
            $table->timestamps();
        });

        Schema::table('ads', function (Blueprint $table) {
            // Campaigns companies submit themselves: paid up front, then reviewed by an admin before they run.
            $table->foreignId('company_id')->nullable()->after('id')->constrained()->nullOnDelete();
            // unpaid → pending (paid, waiting for review) → approved | rejected (refunded). Admins' own banners: approved.
            $table->string('review_status', 10)->default('approved')->after('active');
            $table->string('reject_reason', 300)->nullable()->after('review_status');
            $table->foreignId('reviewed_by')->nullable()->after('reject_reason')->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
            $table->timestamp('submitted_at')->nullable()->after('reviewed_at');
            $table->unsignedInteger('price')->nullable()->after('submitted_at'); // ₮, what the company paid
            // A video banner (muted, loops while on screen): the converted MP4 and its still, on the public disk.
            $table->string('video_path')->nullable()->after('image_path');
            $table->string('poster_path')->nullable()->after('video_path');
            $table->string('image_path')->nullable()->change();
            $table->index(['company_id', 'review_status']);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->unsignedBigInteger('ad_id')->nullable()->index(); // a company paying for a campaign
        });
    }

    public function down(): void
    {
        Schema::table('payments', fn (Blueprint $table) => $table->dropColumn('ad_id'));
        Schema::table('ads', function (Blueprint $table) {
            $table->dropConstrainedForeignId('company_id');
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn(['review_status', 'reject_reason', 'reviewed_at', 'submitted_at', 'price', 'video_path', 'poster_path']);
        });
        Schema::dropIfExists('companies');
    }
};
