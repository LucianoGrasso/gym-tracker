<?php

namespace Database\Seeders;

use App\Enums\SetType;
use App\Models\Exercise;
use App\Models\User;
use App\Support\ExerciseCatalog;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

class GymTrackerSeeder extends Seeder
{
    /** Los 15 ejercicios iniciales; sus datos vienen de ExerciseCatalog. */
    private const EXERCISES = [
        'Press de banca', 'Press con mancuernas', 'Press inclinado con mancuernas', 'Elevaciones laterales',
        'Dominadas', 'Remo con mancuerna', 'Jalón al pecho', 'Curl de bíceps con mancuernas', 'Fondos',
        'Press de hombro con mancuernas', 'Extensión de tríceps en polea', 'Sentadilla', 'Peso muerto rumano',
        'Curl femoral', 'Gemelos en máquina',
    ];

    /**
     * weekday => [day name, [[exercise, sets, reps_min, reps_max, set_type, rest_seconds, target_text], ...]]
     * Cuando el plan original da un rango de series, target_sets toma el máximo y el rango va en target_text.
     */
    private const DAYS = [
        1 => ['Lunes – Pecho (Bilbo)', [
            ['Press de banca', 1, null, null, SetType::Bilbo, 180, '~30 reps explosivas, 40-45 kg'],
            ['Press con mancuernas', 3, 8, 12, SetType::Normal, 120, null],
            ['Press inclinado con mancuernas', 3, 8, 12, SetType::Normal, 120, null],
            ['Elevaciones laterales', 3, 12, 15, SetType::Normal, 90, null],
        ]],
        2 => ['Martes – Espalda y bíceps', [
            ['Dominadas', 6, 5, 6, SetType::Normal, 150, '5-6 series, parar con 1-2 RIR'],
            ['Remo con mancuerna', 3, 8, 10, SetType::Normal, 120, null],
            ['Jalón al pecho', 3, 10, 12, SetType::Normal, 90, null],
            ['Curl de bíceps con mancuernas', 3, 10, 12, SetType::Normal, 90, null],
        ]],
        4 => ['Jueves – Pecho pesado y tríceps', [
            ['Press de banca', 5, 2, 4, SetType::Heavy, 180, '4-5 series, 70-80 kg'],
            ['Fondos', 3, 6, 10, SetType::Normal, 120, null],
            ['Press de hombro con mancuernas', 3, 8, 10, SetType::Normal, 120, null],
            ['Extensión de tríceps en polea', 3, 10, 12, SetType::Normal, 90, null],
        ]],
        5 => ['Viernes – Piernas', [
            ['Sentadilla', 4, 6, 10, SetType::Normal, 180, '3-4 series'],
            ['Peso muerto rumano', 3, 8, 10, SetType::Normal, 150, null],
            ['Curl femoral', 3, 10, 15, SetType::Normal, 90, null],
            ['Gemelos en máquina', 3, 10, 15, SetType::Normal, 90, null],
            ['Dominadas', 3, 4, 5, SetType::Normal, 120, 'Día liviano'],
        ]],
    ];

    private const WEEKDAY_NAMES = [1 => 'Lunes', 2 => 'Martes', 3 => 'Miércoles', 4 => 'Jueves', 5 => 'Viernes', 6 => 'Sábado', 7 => 'Domingo'];

    /**
     * @param  int|null  $firstWeekday  corre los días (misma separación) para que el primero caiga ese día ISO;
     *                                  la demo lo usa para que hoy siempre haya entreno.
     */
    public function run(User $user, ?int $firstWeekday = null): void
    {
        $exercises = $this->seedExercises($user);

        $routine = $user->routines()->create(['name' => 'Rutina 4 días', 'is_active' => true]);

        $first = array_key_first(self::DAYS);
        $position = 0;
        foreach (self::DAYS as $weekday => [$dayName, $items]) {
            if ($firstWeekday !== null) {
                $weekday = (($firstWeekday - 1 + $weekday - $first) % 7) + 1;
                $dayName = self::WEEKDAY_NAMES[$weekday].' – '.explode(' – ', $dayName, 2)[1];
            }
            $day = $routine->days()->create([
                'name' => $dayName,
                'weekday' => $weekday,
                'position' => $position++,
            ]);

            foreach ($items as $i => [$name, $sets, $min, $max, $type, $rest, $text]) {
                $day->exercises()->create([
                    'exercise_id' => $exercises[$name]->id,
                    'position' => $i,
                    'target_sets' => $sets,
                    'target_reps_min' => $min,
                    'target_reps_max' => $max,
                    'default_set_type' => $type,
                    'rest_seconds' => $rest,
                    'target_text' => $text,
                ]);
            }
        }
    }

    /**
     * Crea los 15 ejercicios iniciales del usuario (sin rutina). Lo usan run() y el registro por invitación.
     *
     * @return Collection<string, Exercise>
     */
    public function seedExercises(User $user): Collection
    {
        return collect(self::EXERCISES)->mapWithKeys(
            fn (string $name) => [$name => Exercise::create(['user_id' => $user->id, 'name' => $name] + ExerciseCatalog::get($name))]
        );
    }
}
