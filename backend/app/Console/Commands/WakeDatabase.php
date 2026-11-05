<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class WakeDatabase extends Command
{
    protected $signature = 'app:wake-db
        {--attempts=4 : Intentos antes de rendirse}
        {--sleep=5000 : Milisegundos entre intentos}
        {--database= : Conexión a usar (por defecto, la principal)}';

    protected $description = 'Despierta Aurora (auto-pausa) con una consulta mínima; lo invoca EventBridge Scheduler';

    public function handle(): int
    {
        try {
            retry(
                max(1, (int) $this->option('attempts')),
                fn () => DB::connection($this->option('database'))->select('select 1'),
                (int) $this->option('sleep'),
            );
        } catch (Throwable $e) {
            $this->error('La base de datos no respondió: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info('Base de datos despierta.');

        return self::SUCCESS;
    }
}
