<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per browser/phone that allowed notifications. The endpoint is the push service's address for it.
        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('endpoint', 500)->unique();
            $table->string('public_key', 120);
            $table->string('auth_token', 60);
            $table->string('content_encoding', 16)->default('aes128gcm');
            $table->timestamps();
        });

        // Push text is written on the server, so it needs the person's language (otherwise only kept in the session).
        Schema::table('users', function (Blueprint $table) {
            $table->string('locale', 5)->nullable()->after('appearance');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('locale'));
    }
};
