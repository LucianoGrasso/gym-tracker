<?php

namespace App\Console\Commands;

use App\Models\User;
use Database\Seeders\GymTrackerSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class CreateUser extends Command
{
    protected $signature = 'app:create-user {email} {name}
        {--password= : Si se omite, se pide por consola}
        {--seed : Carga los ejercicios y la rutina inicial para este usuario}';

    protected $description = 'Crea un usuario de GymTracker (no hay registro público)';

    public function handle(): int
    {
        $data = [
            'email' => $this->argument('email'),
            'name' => $this->argument('name'),
            'password' => $this->option('password') ?? $this->secret('Contraseña'),
        ];

        $validator = Validator::make($data, [
            'email' => ['required', 'email', 'unique:users,email'],
            'name' => ['required', 'string', 'max:100'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::create($data); // el cast 'hashed' de User hashea la contraseña

        if ($this->option('seed')) {
            app(GymTrackerSeeder::class)->run($user);
            $this->info('Ejercicios y rutina inicial cargados.');
        }

        $this->info("Usuario {$data['email']} creado.");

        return self::SUCCESS;
    }
}
