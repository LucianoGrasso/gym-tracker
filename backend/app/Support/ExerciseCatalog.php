<?php

namespace App\Support;

use App\Enums\Equipment;
use App\Enums\MuscleGroup;
use InvalidArgumentException;

/** Ejercicios conocidos por la app: los usan el seeder inicial y las plantillas de rutinas. */
final class ExerciseCatalog
{
    /** name => [muscle_group, equipment, is_unilateral, uses_bodyweight] */
    private const EXERCISES = [
        // Pecho
        'Press de banca' => [MuscleGroup::Chest, Equipment::Barbell, false, false],
        'Press con mancuernas' => [MuscleGroup::Chest, Equipment::Dumbbell, false, false],
        'Press inclinado con mancuernas' => [MuscleGroup::Chest, Equipment::Dumbbell, false, false],
        'Press inclinado con barra' => [MuscleGroup::Chest, Equipment::Barbell, false, false],
        'Press de pecho en máquina' => [MuscleGroup::Chest, Equipment::Machine, false, false],
        'Aperturas con mancuernas' => [MuscleGroup::Chest, Equipment::Dumbbell, false, false],
        'Cruce de poleas' => [MuscleGroup::Chest, Equipment::Cable, false, false],
        'Pullover con mancuerna' => [MuscleGroup::Chest, Equipment::Dumbbell, false, false],
        // Espalda
        'Dominadas' => [MuscleGroup::Back, Equipment::Bodyweight, false, true],
        'Jalón al pecho' => [MuscleGroup::Back, Equipment::Cable, false, false],
        'Remo con mancuerna' => [MuscleGroup::Back, Equipment::Dumbbell, true, false],
        'Remo con barra' => [MuscleGroup::Back, Equipment::Barbell, false, false],
        'Remo en T' => [MuscleGroup::Back, Equipment::Barbell, false, false],
        'Remo sentado en polea' => [MuscleGroup::Back, Equipment::Cable, false, false],
        'Peso muerto' => [MuscleGroup::Back, Equipment::Barbell, false, false],
        'Encogimientos con mancuernas' => [MuscleGroup::Back, Equipment::Dumbbell, false, false],
        'Hiperextensiones' => [MuscleGroup::Back, Equipment::Bodyweight, false, true],
        // Hombros
        'Press de hombro con mancuernas' => [MuscleGroup::Shoulders, Equipment::Dumbbell, false, false],
        'Press militar con barra' => [MuscleGroup::Shoulders, Equipment::Barbell, false, false],
        'Press tras nuca' => [MuscleGroup::Shoulders, Equipment::Barbell, false, false],
        'Elevaciones laterales' => [MuscleGroup::Shoulders, Equipment::Dumbbell, false, false],
        'Elevaciones laterales en polea' => [MuscleGroup::Shoulders, Equipment::Cable, true, false],
        'Pájaros con mancuernas' => [MuscleGroup::Shoulders, Equipment::Dumbbell, false, false],
        'Face pull' => [MuscleGroup::Shoulders, Equipment::Cable, false, false],
        // Bíceps
        'Curl de bíceps con mancuernas' => [MuscleGroup::Biceps, Equipment::Dumbbell, false, false],
        'Curl con barra' => [MuscleGroup::Biceps, Equipment::Barbell, false, false],
        'Curl martillo' => [MuscleGroup::Biceps, Equipment::Dumbbell, false, false],
        'Curl inclinado con mancuernas' => [MuscleGroup::Biceps, Equipment::Dumbbell, false, false],
        'Curl concentrado' => [MuscleGroup::Biceps, Equipment::Dumbbell, true, false],
        // Tríceps
        'Fondos' => [MuscleGroup::Triceps, Equipment::Bodyweight, false, true],
        'Extensión de tríceps en polea' => [MuscleGroup::Triceps, Equipment::Cable, false, false],
        'Extensión de tríceps sobre la cabeza en polea' => [MuscleGroup::Triceps, Equipment::Cable, false, false],
        'Press francés' => [MuscleGroup::Triceps, Equipment::Barbell, false, false],
        'Press de banca agarre cerrado' => [MuscleGroup::Triceps, Equipment::Barbell, false, false],
        // Piernas
        'Sentadilla' => [MuscleGroup::Legs, Equipment::Barbell, false, false],
        'Sentadilla frontal' => [MuscleGroup::Legs, Equipment::Barbell, false, false],
        'Sentadilla hack' => [MuscleGroup::Legs, Equipment::Machine, false, false],
        'Sentadilla búlgara' => [MuscleGroup::Legs, Equipment::Dumbbell, true, false],
        'Prensa de piernas' => [MuscleGroup::Legs, Equipment::Machine, false, false],
        'Zancadas con mancuernas' => [MuscleGroup::Legs, Equipment::Dumbbell, true, false],
        'Extensión de cuádriceps' => [MuscleGroup::Legs, Equipment::Machine, false, false],
        'Peso muerto rumano' => [MuscleGroup::Legs, Equipment::Barbell, false, false],
        'Curl femoral' => [MuscleGroup::Legs, Equipment::Machine, false, false],
        'Hip thrust' => [MuscleGroup::Legs, Equipment::Barbell, false, false],
        'Gemelos en máquina' => [MuscleGroup::Legs, Equipment::Machine, false, false],
        // Core
        'Crunch abdominal' => [MuscleGroup::Core, Equipment::Bodyweight, false, true],
        'Elevación de piernas colgado' => [MuscleGroup::Core, Equipment::Bodyweight, false, true],
    ];

    public static function has(string $name): bool
    {
        return array_key_exists($name, self::EXERCISES);
    }

    /** @return array{muscle_group: MuscleGroup, equipment: Equipment, is_unilateral: bool, uses_bodyweight: bool} */
    public static function get(string $name): array
    {
        if (! self::has($name)) {
            throw new InvalidArgumentException("Ejercicio desconocido en el catálogo: {$name}");
        }
        [$muscle, $equipment, $unilateral, $bodyweight] = self::EXERCISES[$name];

        return [
            'muscle_group' => $muscle,
            'equipment' => $equipment,
            'is_unilateral' => $unilateral,
            'uses_bodyweight' => $bodyweight,
        ];
    }
}
