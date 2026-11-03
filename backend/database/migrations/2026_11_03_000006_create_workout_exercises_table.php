<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workout_exercises', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workout_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exercise_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('position')->default(0);
            $table->unsignedTinyInteger('target_sets')->nullable();
            $table->unsignedSmallInteger('target_reps_min')->nullable();
            $table->unsignedSmallInteger('target_reps_max')->nullable();
            $table->string('target_text', 150)->nullable();
            $table->string('default_set_type', 20)->default('normal');
            $table->unsignedSmallInteger('rest_seconds')->default(150);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workout_exercises');
    }
};
