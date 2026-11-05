<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class BodyMetricFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            // unique() sobre el día (no sobre un DateTime con hora): (user_id, date) es único.
            'date' => now()->subDays(fake()->unique()->numberBetween(0, 364))->toDateString(),
            'bodyweight_kg' => 80,
        ];
    }
}
