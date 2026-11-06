<?php

namespace Database\Factories;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Invitation> */
class InvitationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'token_hash' => hash('sha256', Str::random(40)),
            'expires_at' => now()->addDays(Invitation::TTL_DAYS),
        ];
    }

    public function expired(): static
    {
        return $this->state(['expires_at' => now()->subMinute()]);
    }

    public function accepted(): static
    {
        return $this->state(['accepted_at' => now()]);
    }

    /** Para probar el link con un token conocido. */
    public function withToken(string $token): static
    {
        return $this->state(['token_hash' => hash('sha256', $token)]);
    }
}
