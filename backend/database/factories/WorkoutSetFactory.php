<?php

namespace Database\Factories;

use App\Enums\SetType;
use App\Enums\Side;
use App\Models\WorkoutExercise;
use Illuminate\Database\Eloquent\Factories\Factory;

class WorkoutSetFactory extends Factory
{
    public function definition(): array
    {
        return [
            'workout_exercise_id' => WorkoutExercise::factory(),
            'set_number' => 1,
            'set_type' => SetType::Normal,
            'weight_kg' => 50,
            'reps' => 10,
            'side' => Side::Both,
        ];
    }
}
