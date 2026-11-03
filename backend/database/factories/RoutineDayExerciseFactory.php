<?php

namespace Database\Factories;

use App\Enums\SetType;
use App\Models\Exercise;
use App\Models\RoutineDay;
use Illuminate\Database\Eloquent\Factories\Factory;

class RoutineDayExerciseFactory extends Factory
{
    public function definition(): array
    {
        return [
            'routine_day_id' => RoutineDay::factory(),
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
