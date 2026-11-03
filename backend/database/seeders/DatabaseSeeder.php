<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => env('SEED_USER_EMAIL', 'luciano@gymtracker.test')],
            [
                'name' => env('SEED_USER_NAME', 'Luciano'),
                'password' => env('SEED_USER_PASSWORD', 'password'),
            ],
        );

        if ($user->wasRecentlyCreated) {
            $this->callWith(GymTrackerSeeder::class, ['user' => $user]);
        }
    }
}
