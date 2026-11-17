<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workouts', function (Blueprint $table) {
            $table->unsignedSmallInteger('avg_heart_rate')->nullable()->after('notes');
            $table->unsignedSmallInteger('max_heart_rate')->nullable()->after('avg_heart_rate');
            $table->unsignedSmallInteger('active_calories')->nullable()->after('max_heart_rate');
            $table->timestamp('health_synced_at')->nullable()->after('active_calories');
        });
    }

    public function down(): void
    {
        Schema::table('workouts', function (Blueprint $table) {
            $table->dropColumn(['avg_heart_rate', 'max_heart_rate', 'active_calories', 'health_synced_at']);
        });
    }
};
