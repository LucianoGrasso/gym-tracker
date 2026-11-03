<?php

namespace Database\Factories;

use App\Models\Routine;
use Illuminate\Database\Eloquent\Factories\Factory;

class RoutineDayFactory extends Factory
{
    public function definition(): array
    {
        return [
            'routine_id' => Routine::factory(),
            'name' => 'Día '.fake()->word(),
            'weekday' => null,
            'position' => 0,
        ];
    }
}
