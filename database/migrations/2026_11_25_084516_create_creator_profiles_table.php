<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A creator application / profile. One per user. Identity documents and the payout account are private
 * (admins only); the register number and bank account are encrypted, with keyed fingerprints so one
 * person can't open several creator accounts and duplicates can be spotted.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('creator_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();

            // Public profile
            $table->string('handle', 30)->unique(); // /@handle
            $table->string('display_name', 60);
            $table->string('bio', 500)->nullable();
            $table->unsignedInteger('price_monthly'); // ₮ per month
            $table->boolean('adult_content')->default(false); // posts may contain 18+ material

            // Identity (private)
            $table->string('legal_name', 100);
            $table->text('register_number'); // encrypted
            $table->string('register_hash', 64)->unique(); // one creator per person
            $table->string('id_front_path');
            $table->string('id_back_path');
            $table->string('selfie_path'); // holding the ID card

            // Payout (private)
            $table->string('bank_name', 60);
            $table->text('bank_account'); // encrypted
            $table->string('bank_account_hash', 64)->index();
            $table->string('account_holder', 80);

            // Consent, recorded with time and IP
            $table->timestamp('consented_at');
            $table->string('consent_ip', 45)->nullable();

            // Review
            $table->string('status', 16)->default('pending')->index(); // pending | approved | rejected
            $table->string('review_note', 500)->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_profiles');
    }
};
