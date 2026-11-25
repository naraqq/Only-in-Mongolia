<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A price makes a post or message pay-per-view: everyone pays once to unlock it, subscribers too.
        Schema::table('posts', fn (Blueprint $t) => $t->unsignedInteger('price')->nullable()->after('is_adult'));
        Schema::table('messages', fn (Blueprint $t) => $t->unsignedInteger('price')->nullable()->after('tip_amount'));

        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('message_id')->nullable()->after('post_id')->constrained()->nullOnDelete();
        });

        // What each person has unlocked.
        Schema::create('purchases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('post_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('message_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignUlid('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'post_id']);
            $table->unique(['user_id', 'message_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchases');
        Schema::table('payments', fn (Blueprint $t) => $t->dropConstrainedForeignId('message_id'));
        Schema::table('messages', fn (Blueprint $t) => $t->dropColumn('price'));
        Schema::table('posts', fn (Blueprint $t) => $t->dropColumn('price'));
    }
};
