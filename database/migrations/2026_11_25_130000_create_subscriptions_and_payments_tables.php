<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per fan per creator; paying again extends expires_at.
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->timestamp('expires_at')->index();
            $table->timestamps();
            $table->unique(['user_id', 'creator_profile_id']);
        });

        // Every payment attempt (a QPay invoice). Status only ever comes from asking the gateway.
        Schema::create('payments', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->string('purpose', 20)->default('subscription');
            $table->unsignedInteger('amount'); // ₮
            $table->unsignedInteger('platform_fee'); // ₮, fixed when the payment is created
            $table->string('status', 10)->default('pending')->index(); // pending | paid
            $table->string('provider', 10); // qpay | fake
            $table->string('invoice_id')->nullable()->index();
            $table->text('qr_text')->nullable();
            $table->longText('qr_image')->nullable(); // base64 PNG from QPay
            $table->json('bank_links')->nullable(); // [{name, description, logo, link}]
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('subscriptions');
    }
};
