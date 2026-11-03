<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exercises', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('muscle_group', 20);
            $table->string('equipment', 20);
            $table->boolean('is_unilateral')->default(false);
            $table->boolean('uses_bodyweight')->default(false);
            $table->text('notes')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'muscle_group']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exercises');
    }
};
