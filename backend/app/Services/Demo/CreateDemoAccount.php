<?php

namespace App\Services\Demo;

use App\Models\Routine;
use App\Models\User;
use App\Models\Workout;
use Carbon\CarbonImmutable;
use Database\Seeders\GymTrackerSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Cuentas de "Probar demo": 2 h, con la rutina de ejemplo e historial; las vencidas se borran aquí. */
class CreateDemoAccount
{
    public const LIFETIME_MINUTES = 120;

    public const MAX_ACTIVE = 50;

    public function __construct(
        private readonly GymTrackerSeeder $seeder,
        private readonly DemoHistory $history,
    ) {}

    /** Sin tareas programadas (despertarían Aurora): se limpia al crear la siguiente demo. */
    public function purgeExpired(): int
    {
        $expired = User::query()->whereNotNull('demo_expires_at')->where('demo_expires_at', '<=', now())->pluck('id');
        foreach ($expired as $id) {
            // workout_exercises y routine_day_exercises restringen el borrado de exercises: primero esos.
            Workout::withoutGlobalScopes()->where('user_id', $id)->delete();
            Routine::withoutGlobalScopes()->where('user_id', $id)->delete();
            User::whereKey($id)->delete();
        }

        return $expired->count();
    }

    public function isFull(): bool
    {
        return User::query()->where('demo_expires_at', '>', now())->count() >= self::MAX_ACTIVE;
    }

    public function create(): User
    {
        return DB::transaction(function () {
            $user = User::create([
                'name' => 'Invitado',
                'email' => 'demo-'.Str::lower((string) Str::ulid()).'@demo.invalid',
                'password' => Str::random(40),
                'demo_expires_at' => now()->addMinutes(self::LIFETIME_MINUTES),
            ]);
            $today = CarbonImmutable::now(config('app.user_timezone'))->startOfDay();
            $this->seeder->run($user, $today->dayOfWeekIso);
            $routine = Routine::withoutGlobalScopes()->where('user_id', $user->id)->firstOrFail();
            $this->history->generate($user, $routine, $today);

            return $user;
        });
    }
}
