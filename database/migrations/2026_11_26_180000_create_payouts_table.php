<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A creator asking to be paid; an admin sends the bank transfer and marks it paid (or rejects it).
        Schema::create('payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_profile_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('amount'); // ₮
            $table->string('status', 10)->default('requested')->index(); // requested | paid | rejected
            // The bank details at the time of the request (the account number is encrypted).
            $table->string('bank_name');
            $table->text('bank_account');
            $table->string('account_holder');
            $table->string('reference', 120)->nullable(); // bank transfer reference, or why it was rejected
            $table->timestamp('processed_at')->nullable();
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payouts');
    }
};
