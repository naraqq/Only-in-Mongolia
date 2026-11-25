<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('post_id')->nullable()->after('purpose')->constrained()->nullOnDelete(); // the post a tip was for
            $table->string('note', 200)->nullable()->after('post_id'); // the fan's message with a tip
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->unsignedInteger('tip_amount')->nullable()->after('is_mass'); // set on the chat bubble a paid tip creates
        });
    }

    public function down(): void
    {
        Schema::table('messages', fn (Blueprint $t) => $t->dropColumn('tip_amount'));
        Schema::table('payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('post_id');
            $table->dropColumn('note');
        });
    }
};
