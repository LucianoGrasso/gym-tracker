<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workouts', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('routine_day_id')->nullable()->constrained()->nullOnDelete();
            $table->date('date'); // fecha local America/Santiago
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->decimal('bodyweight_kg', 5, 2)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workouts');
    }
};
