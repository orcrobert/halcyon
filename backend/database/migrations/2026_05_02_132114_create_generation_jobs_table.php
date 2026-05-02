<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generation_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('atmosphere_id')->constrained()->cascadeOnDelete();
            $table->string('status')->default('queued')->index();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->string('current_stage')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generation_jobs');
    }
};
