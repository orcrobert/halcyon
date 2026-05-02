<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('elements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('atmosphere_id')->constrained()->cascadeOnDelete();
            $table->string('label');
            $table->string('type');
            $table->text('prompt');
            $table->string('audio_path');
            $table->float('duration_s')->nullable();

            $table->float('volume')->default(0.8);
            $table->float('pan')->default(0.0);
            $table->float('depth')->default(0.0);
            $table->unsignedSmallInteger('tuning_hz')->default(440);
            $table->json('eq_json')->nullable();

            $table->float('original_volume')->default(0.8);
            $table->float('original_pan')->default(0.0);
            $table->float('original_depth')->default(0.0);
            $table->json('original_eq_json')->nullable();

            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('elements');
    }
};
