<?php

namespace Database\Factories;

use App\Enums\SetType;
use App\Models\Exercise;
use App\Models\Workout;
use Illuminate\Database\Eloquent\Factories\Factory;

class WorkoutExerciseFactory extends Factory
{
    public function definition(): array
    {
        return [
            'workout_id' => Workout::factory(),
            'exercise_id' => Exercise::factory(),
            'position' => 0,
            'target_sets' => 3,
            'target_reps_min' => 8,
            'target_reps_max' => 12,
            'default_set_type' => SetType::Normal,
            'rest_seconds' => 150,
        ];
    }
}
