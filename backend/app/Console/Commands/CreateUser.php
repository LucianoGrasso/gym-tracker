<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class CreateUser extends Command
{
    protected $signature = 'app:create-user {email} {name} {--password= : Si se omite, se pide por consola}';

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

        User::create($data); // el cast 'hashed' de User hashea la contraseña

        $this->info("Usuario {$data['email']} creado.");

        return self::SUCCESS;
    }
}
