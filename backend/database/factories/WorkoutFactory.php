<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class WorkoutFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'routine_day_id' => null,
            'date' => now('America/Santiago')->toDateString(),
            'started_at' => now(),
        ];
    }
}
