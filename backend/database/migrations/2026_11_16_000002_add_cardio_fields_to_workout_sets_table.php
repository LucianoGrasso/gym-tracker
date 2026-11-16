<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workout_sets', function (Blueprint $table) {
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->decimal('speed_kmh', 4, 1)->nullable();
            $table->decimal('incline_pct', 3, 1)->nullable();
            $table->decimal('distance_km', 6, 2)->nullable();
            $table->unsignedSmallInteger('avg_heart_rate')->nullable();
            $table->unsignedSmallInteger('calories')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('workout_sets', function (Blueprint $table) {
            $table->dropColumn(['duration_seconds', 'speed_kmh', 'incline_pct', 'distance_km', 'avg_heart_rate', 'calories']);
        });
    }
};
