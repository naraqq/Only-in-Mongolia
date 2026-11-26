<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The fan asked us to renew this subscription from their wallet when it's about to run out.
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->boolean('auto_renew')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('subscriptions', fn (Blueprint $table) => $table->dropColumn('auto_renew'));
    }
};
