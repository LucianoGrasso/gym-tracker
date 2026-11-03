<?php

namespace Database\Factories;

use App\Enums\Equipment;
use App\Enums\MuscleGroup;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class ExerciseFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => ucfirst(fake()->unique()->words(2, true)),
            'muscle_group' => fake()->randomElement(MuscleGroup::cases()),
            'equipment' => fake()->randomElement(Equipment::cases()),
            'is_unilateral' => false,
            'uses_bodyweight' => false,
        ];
    }
}
