<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('atmospheres', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('style_clip_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title')->nullable();
            $table->text('prompt');
            $table->string('status')->default('pending')->index();
            $table->json('decomposed_json')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('generated_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('atmospheres');
    }
};
