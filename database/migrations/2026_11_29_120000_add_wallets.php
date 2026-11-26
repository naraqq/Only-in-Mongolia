<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The current balance, kept next to the user so it can be locked while it changes.
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('wallet_balance')->default(0);
        });

        // A top-up is a QPay payment that belongs to no creator.
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('creator_profile_id')->nullable()->change();
        });

        // Every change to a balance, never edited or deleted: top-ups (+), spending (−), refunds (+), corrections.
        Schema::create('wallet_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 16);
            $table->bigInteger('amount');
            $table->unsignedBigInteger('balance_after');
            $table->foreignUlid('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note', 200)->nullable();
            $table->timestamps();
            $table->index(['user_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_entries');
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('creator_profile_id')->nullable(false)->change();
        });
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('wallet_balance'));
    }
};
