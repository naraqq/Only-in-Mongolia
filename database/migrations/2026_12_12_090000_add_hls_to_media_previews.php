<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media_previews', function (Blueprint $table) {
            // Adaptive streaming (App\Media\Hls): the master playlist of the video's {name}.hls/ folder.
            $table->string('hls_path')->nullable()->after('thumbs');
        });
    }

    public function down(): void
    {
        Schema::table('media_previews', fn (Blueprint $table) => $table->dropColumn('hls_path'));
    }
};
