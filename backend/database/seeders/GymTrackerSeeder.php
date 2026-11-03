<?php

namespace Database\Seeders;

use App\Enums\Equipment;
use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Models\Exercise;
use App\Models\User;
use Illuminate\Database\Seeder;

class GymTrackerSeeder extends Seeder
{
    /** name => [muscle_group, equipment, is_unilateral, uses_bodyweight] */
    private const EXERCISES = [
        'Press de banca' => [MuscleGroup::Chest, Equipment::Barbell, false, false],
        'Press con mancuernas' => [MuscleGroup::Chest, Equipment::Dumbbell, false, false],
        'Press inclinado con mancuernas' => [MuscleGroup::Chest, Equipment::Dumbbell, false, false],
        'Elevaciones laterales' => [MuscleGroup::Shoulders, Equipment::Dumbbell, false, false],
        'Dominadas' => [MuscleGroup::Back, Equipment::Bodyweight, false, true],
        'Remo con mancuerna' => [MuscleGroup::Back, Equipment::Dumbbell, true, false],
        'Jalón al pecho' => [MuscleGroup::Back, Equipment::Cable, false, false],
        'Curl de bíceps con mancuernas' => [MuscleGroup::Biceps, Equipment::Dumbbell, false, false],
        'Fondos' => [MuscleGroup::Triceps, Equipment::Bodyweight, false, true],
        'Press de hombro con mancuernas' => [MuscleGroup::Shoulders, Equipment::Dumbbell, false, false],
        'Extensión de tríceps en polea' => [MuscleGroup::Triceps, Equipment::Cable, false, false],
        'Sentadilla' => [MuscleGroup::Legs, Equipment::Barbell, false, false],
        'Peso muerto rumano' => [MuscleGroup::Legs, Equipment::Barbell, false, false],
        'Curl femoral' => [MuscleGroup::Legs, Equipment::Machine, false, false],
        'Gemelos en máquina' => [MuscleGroup::Legs, Equipment::Machine, false, false],
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

    public function run(User $user): void
    {
        $exercises = collect(self::EXERCISES)->map(
            fn (array $e, string $name) => Exercise::create([
                'user_id' => $user->id,
                'name' => $name,
                'muscle_group' => $e[0],
                'equipment' => $e[1],
                'is_unilateral' => $e[2],
                'uses_bodyweight' => $e[3],
            ])
        );

        $routine = $user->routines()->create(['name' => 'Rutina 4 días', 'is_active' => true]);

        $position = 0;
        foreach (self::DAYS as $weekday => [$dayName, $items]) {
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
}
