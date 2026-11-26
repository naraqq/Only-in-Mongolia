<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['post_media', 'message_media'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('sha256', 64)->nullable()->index(); // fingerprint, to match against the blocklist
                $t->string('scan_status', 12)->default('pending'); // pending, ok, flagged, error
                $t->json('scan_labels')->nullable();
            });
        }

        // Held back by the automatic scan until an admin looks at it: only the creator and admins can see it.
        Schema::table('posts', function (Blueprint $t) {
            $t->timestamp('held_at')->nullable();
        });

        // Files that may never be uploaded again (removed by an admin, or from a known-bad hash list).
        Schema::create('media_blocklist', function (Blueprint $t) {
            $t->id();
            $t->string('sha256', 64)->unique();
            $t->string('reason', 40);
            $t->string('source', 60)->nullable(); // e.g. "report:12", or the hash list it came from
            $t->foreignId('added_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_blocklist');
        Schema::table('posts', fn (Blueprint $t) => $t->dropColumn('held_at'));
        foreach (['post_media', 'message_media'] as $table) {
            Schema::table($table, fn (Blueprint $t) => $t->dropColumn(['sha256', 'scan_status', 'scan_labels']));
        }
    }
};
