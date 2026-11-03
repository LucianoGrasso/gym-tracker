<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('routine_day_exercises', function (Blueprint $table) {
            $table->id();
            $table->foreignId('routine_day_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exercise_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('position')->default(0);
            $table->unsignedTinyInteger('target_sets')->default(3);
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
        Schema::dropIfExists('routine_day_exercises');
    }
};
