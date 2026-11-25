<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Something reported for moderation: a post, comment, creator or message, or (copyright takedowns) just a URL.
        Schema::create('reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reporter_id')->nullable()->constrained('users')->nullOnDelete(); // null: takedown form from outside
            $table->nullableMorphs('reportable');
            $table->string('reason', 20); // minor | nonconsensual | illegal | harassment | spam | copyright | other
            $table->text('details')->nullable();
            $table->string('contact_name')->nullable(); // takedown requests
            $table->string('contact_email')->nullable();
            $table->string('url', 500)->nullable();
            $table->string('status', 10)->default('open')->index(); // open | actioned | dismissed
            $table->string('resolution', 300)->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('blocks', function (Blueprint $table) {
            $table->foreignId('blocker_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('blocked_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['blocker_id', 'blocked_id']);
            $table->index('blocked_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blocks');
        Schema::dropIfExists('reports');
    }
};
