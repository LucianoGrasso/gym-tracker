<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workout_sets', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workout_exercise_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('set_number');
            $table->string('set_type', 20)->default('normal');
            $table->decimal('weight_kg', 6, 2)->default(0);
            $table->unsignedSmallInteger('reps');
            $table->string('side', 10)->default('both');
            $table->unsignedTinyInteger('rir')->nullable();
            $table->unsignedTinyInteger('pain_level')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workout_sets');
    }
};
