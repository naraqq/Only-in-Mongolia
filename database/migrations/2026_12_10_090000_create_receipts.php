<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A receipt for one payment a company made (App\Billing\Receipts). The buyer and the amounts are copied in,
        // so the document never changes after it's issued, even if the company edits its details later.
        Schema::create('receipts', function (Blueprint $table) {
            $table->id();
            $table->ulid('payment_id')->unique();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('number', 30)->unique(); // OIM-2026-000001
            $table->unsignedSmallInteger('year');
            $table->unsignedInteger('sequence');
            $table->string('buyer_name', 120);
            $table->string('buyer_register', 20)->nullable();
            $table->string('buyer_email')->nullable();
            $table->string('description', 255);
            $table->unsignedInteger('quantity')->default(1); // days
            $table->unsignedInteger('total'); // ₮, VAT included
            $table->unsignedInteger('vat'); // ₮, part of total
            $table->unsignedTinyInteger('vat_percent');
            $table->timestamp('issued_at');
            // e-barimt (PosAPI 3.0): none | pending | issued | failed | returned
            $table->string('ebarimt_status', 10)->default('none');
            $table->string('ebarimt_id', 40)->nullable(); // ДДТД
            $table->text('ebarimt_qr')->nullable();
            $table->string('ebarimt_lottery', 20)->nullable();
            $table->timestamp('ebarimt_date')->nullable();
            $table->string('ebarimt_error', 500)->nullable();
            $table->timestamps();
            $table->unique(['year', 'sequence']);
            $table->index('ebarimt_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receipts');
    }
};
