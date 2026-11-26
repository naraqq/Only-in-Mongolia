<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Free trial for new subscribers, in days (null = no trial).
        Schema::table('creator_profiles', function (Blueprint $table) {
            $table->unsignedTinyInteger('trial_days')->nullable();
        });

        // Who has had a creator's free trial (once per fan per creator, ever).
        Schema::create('subscription_trials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('days');
            $table->timestamps();
            $table->unique(['user_id', 'creator_profile_id']);
        });

        // Discount codes a creator hands out: a percentage off a subscription purchase.
        Schema::create('promo_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->string('code', 24);
            $table->unsignedTinyInteger('percent_off');
            $table->unsignedInteger('max_uses')->nullable();
            $table->unsignedInteger('uses')->default(0);
            $table->timestamp('expires_at')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['creator_profile_id', 'code']);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('promo_code_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('discount')->default(0); // ₮ taken off by the code
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('promo_code_id');
            $table->dropColumn('discount');
        });
        Schema::dropIfExists('promo_codes');
        Schema::dropIfExists('subscription_trials');
        Schema::table('creator_profiles', fn (Blueprint $table) => $table->dropColumn('trial_days'));
    }
};
