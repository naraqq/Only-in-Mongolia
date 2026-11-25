<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A banned person can't sign in; their creator page is suspended.
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('banned_at')->nullable()->index();
            $table->string('ban_reason', 300)->nullable();
        });

        // Refunded payments stop counting as earnings and take back what they bought.
        Schema::table('payments', function (Blueprint $table) {
            $table->timestamp('refunded_at')->nullable();
            $table->foreignId('refunded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('refund_reason', 300)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('refunded_by');
            $table->dropColumn(['refunded_at', 'refund_reason']);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['banned_at', 'ban_reason']);
        });
    }
};
