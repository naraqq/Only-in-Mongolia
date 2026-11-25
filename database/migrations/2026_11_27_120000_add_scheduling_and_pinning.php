<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->timestamp('publish_at')->nullable()->index(); // null = published when created; future = scheduled
            $table->timestamp('announced_at')->nullable(); // when subscribers were notified (once)
        });

        Schema::table('creator_profiles', function (Blueprint $table) {
            $table->foreignId('pinned_post_id')->nullable()->constrained('posts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('creator_profiles', fn (Blueprint $t) => $t->dropConstrainedForeignId('pinned_post_id'));
        Schema::table('posts', fn (Blueprint $t) => $t->dropColumn(['publish_at', 'announced_at']));
    }
};
