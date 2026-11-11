<?php

namespace App\Support;

use App\Enums\Equipment;
use App\Enums\MuscleGroup;
use Illuminate\Support\Str;
use InvalidArgumentException;

/** Biblioteca de ejercicios de la app: la usan la pantalla Biblioteca, el seeder inicial, la demo y las plantillas. */
final class ExerciseCatalog
{
    /** name => [músculo principal, secundarios (cuentan ½ serie), equipo, unilateral, carga con peso corporal] */
    private const EXERCISES = [
        // Pecho
        'Press de banca' => [MuscleGroup::Chest, [MuscleGroup::Triceps, MuscleGroup::Shoulders], Equipment::Barbell, false, false],
        'Press con mancuernas' => [MuscleGroup::Chest, [MuscleGroup::Triceps, MuscleGroup::Shoulders], Equipment::Dumbbell, false, false],
        'Press inclinado con barra' => [MuscleGroup::Chest, [MuscleGroup::Shoulders, MuscleGroup::Triceps], Equipment::Barbell, false, false],
        'Press inclinado con mancuernas' => [MuscleGroup::Chest, [MuscleGroup::Shoulders, MuscleGroup::Triceps], Equipment::Dumbbell, false, false],
        'Press declinado con barra' => [MuscleGroup::Chest, [MuscleGroup::Triceps], Equipment::Barbell, false, false],
        'Press de banca en Smith' => [MuscleGroup::Chest, [MuscleGroup::Triceps, MuscleGroup::Shoulders], Equipment::Smith, false, false],
        'Press inclinado en Smith' => [MuscleGroup::Chest, [MuscleGroup::Shoulders, MuscleGroup::Triceps], Equipment::Smith, false, false],
        'Press de pecho en máquina' => [MuscleGroup::Chest, [MuscleGroup::Triceps, MuscleGroup::Shoulders], Equipment::Machine, false, false],
        'Press inclinado en máquina' => [MuscleGroup::Chest, [MuscleGroup::Shoulders, MuscleGroup::Triceps], Equipment::Machine, false, false],
        'Aperturas con mancuernas' => [MuscleGroup::Chest, [MuscleGroup::Shoulders], Equipment::Dumbbell, false, false],
        'Aperturas inclinadas con mancuernas' => [MuscleGroup::Chest, [MuscleGroup::Shoulders], Equipment::Dumbbell, false, false],
        'Aperturas en máquina' => [MuscleGroup::Chest, [], Equipment::Machine, false, false],
        'Cruce de poleas' => [MuscleGroup::Chest, [MuscleGroup::Shoulders], Equipment::Cable, false, false],
        'Cruce de poleas de abajo hacia arriba' => [MuscleGroup::Chest, [MuscleGroup::Shoulders], Equipment::Cable, false, false],
        'Flexiones de brazos' => [MuscleGroup::Chest, [MuscleGroup::Triceps, MuscleGroup::Shoulders, MuscleGroup::Core], Equipment::Bodyweight, false, true],
        'Fondos para pecho' => [MuscleGroup::Chest, [MuscleGroup::Triceps, MuscleGroup::Shoulders], Equipment::Bodyweight, false, true],
        'Pullover con mancuerna' => [MuscleGroup::Chest, [MuscleGroup::Lats, MuscleGroup::Triceps], Equipment::Dumbbell, false, false],
        // Dorsales
        'Dominadas' => [MuscleGroup::Lats, [MuscleGroup::Biceps, MuscleGroup::UpperBack], Equipment::Bodyweight, false, true],
        'Dominadas supinas' => [MuscleGroup::Lats, [MuscleGroup::Biceps], Equipment::Bodyweight, false, true],
        'Dominadas asistidas en máquina' => [MuscleGroup::Lats, [MuscleGroup::Biceps, MuscleGroup::UpperBack], Equipment::Machine, false, false],
        'Jalón al pecho' => [MuscleGroup::Lats, [MuscleGroup::Biceps, MuscleGroup::UpperBack], Equipment::Cable, false, false],
        'Jalón al pecho agarre cerrado' => [MuscleGroup::Lats, [MuscleGroup::Biceps], Equipment::Cable, false, false],
        'Jalón al pecho agarre supino' => [MuscleGroup::Lats, [MuscleGroup::Biceps], Equipment::Cable, false, false],
        'Jalón unilateral en polea' => [MuscleGroup::Lats, [MuscleGroup::Biceps], Equipment::Cable, true, false],
        'Jalón con brazos rectos' => [MuscleGroup::Lats, [], Equipment::Cable, false, false],
        'Remo con mancuerna' => [MuscleGroup::Lats, [MuscleGroup::UpperBack, MuscleGroup::Biceps], Equipment::Dumbbell, true, false],
        'Remo unilateral en polea' => [MuscleGroup::Lats, [MuscleGroup::UpperBack, MuscleGroup::Biceps], Equipment::Cable, true, false],
        'Remo con barra agarre supino' => [MuscleGroup::Lats, [MuscleGroup::UpperBack, MuscleGroup::Biceps], Equipment::Barbell, false, false],
        'Pullover en máquina' => [MuscleGroup::Lats, [MuscleGroup::Chest], Equipment::Machine, false, false],
        // Espalda alta
        'Remo con barra' => [MuscleGroup::UpperBack, [MuscleGroup::Lats, MuscleGroup::Biceps], Equipment::Barbell, false, false],
        'Remo Pendlay' => [MuscleGroup::UpperBack, [MuscleGroup::Lats, MuscleGroup::Biceps], Equipment::Barbell, false, false],
        'Remo en T' => [MuscleGroup::UpperBack, [MuscleGroup::Lats, MuscleGroup::Biceps], Equipment::Barbell, false, false],
        'Remo sentado en polea' => [MuscleGroup::UpperBack, [MuscleGroup::Lats, MuscleGroup::Biceps], Equipment::Cable, false, false],
        'Remo sentado agarre abierto en polea' => [MuscleGroup::UpperBack, [MuscleGroup::Shoulders, MuscleGroup::Biceps], Equipment::Cable, false, false],
        'Remo en máquina' => [MuscleGroup::UpperBack, [MuscleGroup::Lats, MuscleGroup::Biceps], Equipment::Machine, false, false],
        'Remo apoyado en banco con mancuernas' => [MuscleGroup::UpperBack, [MuscleGroup::Lats, MuscleGroup::Biceps], Equipment::Dumbbell, false, false],
        'Remo en Smith' => [MuscleGroup::UpperBack, [MuscleGroup::Lats, MuscleGroup::Biceps], Equipment::Smith, false, false],
        'Remo invertido' => [MuscleGroup::UpperBack, [MuscleGroup::Biceps, MuscleGroup::Lats], Equipment::Bodyweight, false, true],
        'Encogimientos con mancuernas' => [MuscleGroup::UpperBack, [], Equipment::Dumbbell, false, false],
        'Encogimientos con barra' => [MuscleGroup::UpperBack, [], Equipment::Barbell, false, false],
        'Remo al mentón' => [MuscleGroup::UpperBack, [MuscleGroup::Shoulders, MuscleGroup::Biceps], Equipment::Barbell, false, false],
        // Hombros
        'Press militar con barra' => [MuscleGroup::Shoulders, [MuscleGroup::Triceps], Equipment::Barbell, false, false],
        'Press de hombro con mancuernas' => [MuscleGroup::Shoulders, [MuscleGroup::Triceps], Equipment::Dumbbell, false, false],
        'Press Arnold' => [MuscleGroup::Shoulders, [MuscleGroup::Triceps], Equipment::Dumbbell, false, false],
        'Press tras nuca' => [MuscleGroup::Shoulders, [MuscleGroup::Triceps, MuscleGroup::UpperBack], Equipment::Barbell, false, false],
        'Press de hombro en máquina' => [MuscleGroup::Shoulders, [MuscleGroup::Triceps], Equipment::Machine, false, false],
        'Press de hombro en Smith' => [MuscleGroup::Shoulders, [MuscleGroup::Triceps], Equipment::Smith, false, false],
        'Press landmine' => [MuscleGroup::Shoulders, [MuscleGroup::Chest, MuscleGroup::Triceps], Equipment::Barbell, true, false],
        'Elevaciones laterales' => [MuscleGroup::Shoulders, [MuscleGroup::UpperBack], Equipment::Dumbbell, false, false],
        'Elevaciones laterales en polea' => [MuscleGroup::Shoulders, [MuscleGroup::UpperBack], Equipment::Cable, true, false],
        'Elevaciones laterales en máquina' => [MuscleGroup::Shoulders, [], Equipment::Machine, false, false],
        'Elevaciones frontales con mancuernas' => [MuscleGroup::Shoulders, [MuscleGroup::Chest], Equipment::Dumbbell, false, false],
        'Elevaciones frontales en polea' => [MuscleGroup::Shoulders, [MuscleGroup::Chest], Equipment::Cable, false, false],
        'Pájaros con mancuernas' => [MuscleGroup::Shoulders, [MuscleGroup::UpperBack], Equipment::Dumbbell, false, false],
        'Pájaros en máquina' => [MuscleGroup::Shoulders, [MuscleGroup::UpperBack], Equipment::Machine, false, false],
        'Pájaros en polea' => [MuscleGroup::Shoulders, [MuscleGroup::UpperBack], Equipment::Cable, false, false],
        'Face pull' => [MuscleGroup::Shoulders, [MuscleGroup::UpperBack], Equipment::Cable, false, false],
        // Bíceps
        'Curl con barra' => [MuscleGroup::Biceps, [], Equipment::Barbell, false, false],
        'Curl con barra Z' => [MuscleGroup::Biceps, [], Equipment::Barbell, false, false],
        'Curl de bíceps con mancuernas' => [MuscleGroup::Biceps, [], Equipment::Dumbbell, false, false],
        'Curl martillo' => [MuscleGroup::Biceps, [MuscleGroup::Other], Equipment::Dumbbell, false, false],
        'Curl inclinado con mancuernas' => [MuscleGroup::Biceps, [], Equipment::Dumbbell, false, false],
        'Curl concentrado' => [MuscleGroup::Biceps, [], Equipment::Dumbbell, true, false],
        'Curl predicador con barra Z' => [MuscleGroup::Biceps, [], Equipment::Barbell, false, false],
        'Curl predicador en máquina' => [MuscleGroup::Biceps, [], Equipment::Machine, false, false],
        'Curl en polea' => [MuscleGroup::Biceps, [], Equipment::Cable, false, false],
        'Curl martillo con cuerda en polea' => [MuscleGroup::Biceps, [MuscleGroup::Other], Equipment::Cable, false, false],
        'Curl araña' => [MuscleGroup::Biceps, [], Equipment::Dumbbell, false, false],
        'Curl bayesiano en polea' => [MuscleGroup::Biceps, [], Equipment::Cable, true, false],
        // Tríceps
        'Fondos' => [MuscleGroup::Triceps, [MuscleGroup::Chest, MuscleGroup::Shoulders], Equipment::Bodyweight, false, true],
        'Fondos en banco' => [MuscleGroup::Triceps, [MuscleGroup::Shoulders], Equipment::Bodyweight, false, true],
        'Fondos en máquina' => [MuscleGroup::Triceps, [MuscleGroup::Chest], Equipment::Machine, false, false],
        'Extensión de tríceps en polea' => [MuscleGroup::Triceps, [], Equipment::Cable, false, false],
        'Extensión de tríceps con cuerda' => [MuscleGroup::Triceps, [], Equipment::Cable, false, false],
        'Extensión de tríceps sobre la cabeza en polea' => [MuscleGroup::Triceps, [], Equipment::Cable, false, false],
        'Extensión de tríceps sobre la cabeza con mancuerna' => [MuscleGroup::Triceps, [], Equipment::Dumbbell, false, false],
        'Press francés' => [MuscleGroup::Triceps, [], Equipment::Barbell, false, false],
        'Press francés con mancuernas' => [MuscleGroup::Triceps, [], Equipment::Dumbbell, false, false],
        'Press de banca agarre cerrado' => [MuscleGroup::Triceps, [MuscleGroup::Chest, MuscleGroup::Shoulders], Equipment::Barbell, false, false],
        'Patada de tríceps' => [MuscleGroup::Triceps, [], Equipment::Dumbbell, true, false],
        'Flexiones diamante' => [MuscleGroup::Triceps, [MuscleGroup::Chest, MuscleGroup::Shoulders], Equipment::Bodyweight, false, true],
        // Cuádriceps
        'Sentadilla' => [MuscleGroup::Quads, [MuscleGroup::Glutes, MuscleGroup::Hamstrings], Equipment::Barbell, false, false],
        'Sentadilla frontal' => [MuscleGroup::Quads, [MuscleGroup::Glutes, MuscleGroup::Core], Equipment::Barbell, false, false],
        'Sentadilla en Smith' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Smith, false, false],
        'Sentadilla goblet' => [MuscleGroup::Quads, [MuscleGroup::Glutes, MuscleGroup::Core], Equipment::Kettlebell, false, false],
        'Sentadilla con peso corporal' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Bodyweight, false, true],
        'Sentadilla hack' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Machine, false, false],
        'Sentadilla péndulo' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Machine, false, false],
        'Sentadilla sissy' => [MuscleGroup::Quads, [], Equipment::Bodyweight, false, true],
        'Sentadilla búlgara' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Dumbbell, true, false],
        'Prensa de piernas' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Machine, false, false],
        'Prensa unilateral' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Machine, true, false],
        'Zancadas con mancuernas' => [MuscleGroup::Quads, [MuscleGroup::Glutes, MuscleGroup::Hamstrings], Equipment::Dumbbell, true, false],
        'Zancadas caminando' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Dumbbell, true, false],
        'Zancadas con barra' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Barbell, true, false],
        'Subidas al cajón' => [MuscleGroup::Quads, [MuscleGroup::Glutes], Equipment::Dumbbell, true, false],
        'Extensión de cuádriceps' => [MuscleGroup::Quads, [], Equipment::Machine, false, false],
        // Femorales
        'Peso muerto' => [MuscleGroup::Hamstrings, [MuscleGroup::Glutes, MuscleGroup::UpperBack], Equipment::Barbell, false, false],
        'Peso muerto rumano' => [MuscleGroup::Hamstrings, [MuscleGroup::Glutes], Equipment::Barbell, false, false],
        'Peso muerto rumano con mancuernas' => [MuscleGroup::Hamstrings, [MuscleGroup::Glutes], Equipment::Dumbbell, false, false],
        'Peso muerto con piernas rígidas' => [MuscleGroup::Hamstrings, [MuscleGroup::Glutes], Equipment::Barbell, false, false],
        'Buenos días' => [MuscleGroup::Hamstrings, [MuscleGroup::Glutes], Equipment::Barbell, false, false],
        'Curl femoral' => [MuscleGroup::Hamstrings, [], Equipment::Machine, false, false],
        'Curl femoral sentado' => [MuscleGroup::Hamstrings, [], Equipment::Machine, false, false],
        'Curl femoral de pie' => [MuscleGroup::Hamstrings, [], Equipment::Machine, true, false],
        'Curl nórdico' => [MuscleGroup::Hamstrings, [], Equipment::Bodyweight, false, true],
        'Hiperextensiones' => [MuscleGroup::Hamstrings, [MuscleGroup::Glutes], Equipment::Bodyweight, false, true],
        // Glúteos
        'Hip thrust' => [MuscleGroup::Glutes, [MuscleGroup::Hamstrings], Equipment::Barbell, false, false],
        'Hip thrust en máquina' => [MuscleGroup::Glutes, [MuscleGroup::Hamstrings], Equipment::Machine, false, false],
        'Hip thrust en Smith' => [MuscleGroup::Glutes, [MuscleGroup::Hamstrings], Equipment::Smith, false, false],
        'Puente de glúteos' => [MuscleGroup::Glutes, [MuscleGroup::Hamstrings], Equipment::Bodyweight, false, true],
        'Patada de glúteo en polea' => [MuscleGroup::Glutes, [MuscleGroup::Hamstrings], Equipment::Cable, true, false],
        'Patada de glúteo en máquina' => [MuscleGroup::Glutes, [MuscleGroup::Hamstrings], Equipment::Machine, true, false],
        'Abducción de cadera en máquina' => [MuscleGroup::Glutes, [], Equipment::Machine, false, false],
        'Abducción de cadera con banda' => [MuscleGroup::Glutes, [], Equipment::Band, false, false],
        'Peso muerto sumo' => [MuscleGroup::Glutes, [MuscleGroup::Quads, MuscleGroup::Hamstrings], Equipment::Barbell, false, false],
        'Swing con kettlebell' => [MuscleGroup::Glutes, [MuscleGroup::Hamstrings, MuscleGroup::Core], Equipment::Kettlebell, false, false],
        // Gemelos
        'Gemelos en máquina' => [MuscleGroup::Calves, [], Equipment::Machine, false, false],
        'Gemelos sentado' => [MuscleGroup::Calves, [], Equipment::Machine, false, false],
        'Gemelos en prensa' => [MuscleGroup::Calves, [], Equipment::Machine, false, false],
        'Gemelos en Smith' => [MuscleGroup::Calves, [], Equipment::Smith, false, false],
        'Gemelos de pie con mancuerna' => [MuscleGroup::Calves, [], Equipment::Dumbbell, true, false],
        'Gemelos con peso corporal' => [MuscleGroup::Calves, [], Equipment::Bodyweight, false, true],
        // Core
        'Crunch abdominal' => [MuscleGroup::Core, [], Equipment::Bodyweight, false, true],
        'Crunch inverso' => [MuscleGroup::Core, [], Equipment::Bodyweight, false, true],
        'Crunch en polea' => [MuscleGroup::Core, [], Equipment::Cable, false, false],
        'Crunch en máquina' => [MuscleGroup::Core, [], Equipment::Machine, false, false],
        'Elevación de piernas colgado' => [MuscleGroup::Core, [], Equipment::Bodyweight, false, true],
        'Elevación de rodillas en paralelas' => [MuscleGroup::Core, [], Equipment::Bodyweight, false, true],
        'Elevación de piernas en el suelo' => [MuscleGroup::Core, [], Equipment::Bodyweight, false, true],
        'Plancha' => [MuscleGroup::Core, [], Equipment::Bodyweight, false, true],
        'Plancha lateral' => [MuscleGroup::Core, [], Equipment::Bodyweight, true, true],
        'Rueda abdominal' => [MuscleGroup::Core, [MuscleGroup::Lats], Equipment::Bodyweight, false, true],
        'Russian twist' => [MuscleGroup::Core, [], Equipment::Dumbbell, false, false],
        'Pallof press' => [MuscleGroup::Core, [], Equipment::Cable, true, false],
        'Leñador en polea' => [MuscleGroup::Core, [], Equipment::Cable, true, false],
        'Dead bug' => [MuscleGroup::Core, [], Equipment::Bodyweight, false, true],
        'Escaladores' => [MuscleGroup::Core, [], Equipment::Bodyweight, false, true],
        'Hollow hold' => [MuscleGroup::Core, [], Equipment::Bodyweight, false, true],
        // Otro (antebrazos, aductores, lumbares)
        'Curl de muñeca' => [MuscleGroup::Other, [], Equipment::Barbell, false, false],
        'Curl de muñeca inverso' => [MuscleGroup::Other, [], Equipment::Barbell, false, false],
        'Paseo del granjero' => [MuscleGroup::Other, [MuscleGroup::Core, MuscleGroup::UpperBack], Equipment::Dumbbell, false, false],
        'Colgarse de la barra' => [MuscleGroup::Other, [MuscleGroup::Lats], Equipment::Bodyweight, false, true],
        'Aducción de cadera en máquina' => [MuscleGroup::Other, [], Equipment::Machine, false, false],
        'Plancha Copenhague' => [MuscleGroup::Other, [MuscleGroup::Core], Equipment::Bodyweight, true, true],
        'Extensión lumbar en máquina' => [MuscleGroup::Other, [MuscleGroup::Glutes], Equipment::Machine, false, false],
        'Superman' => [MuscleGroup::Other, [MuscleGroup::Glutes], Equipment::Bodyweight, false, true],
    ];

    public static function has(string $name): bool
    {
        return array_key_exists($name, self::EXERCISES);
    }

    /**
     * @return array{muscle_group: MuscleGroup, secondary_muscles: list<MuscleGroup>, equipment: Equipment, is_unilateral: bool, uses_bodyweight: bool}
     */
    public static function get(string $name): array
    {
        if (! self::has($name)) {
            throw new InvalidArgumentException("Ejercicio desconocido en el catálogo: {$name}");
        }
        [$muscle, $secondary, $equipment, $unilateral, $bodyweight] = self::EXERCISES[$name];

        return [
            'muscle_group' => $muscle,
            'secondary_muscles' => $secondary,
            'equipment' => $equipment,
            'is_unilateral' => $unilateral,
            'uses_bodyweight' => $bodyweight,
        ];
    }

    /**
     * La biblioteca completa, en el orden del catálogo (agrupada por músculo principal).
     *
     * @return list<array{slug: string, name: string, muscle_group: MuscleGroup, secondary_muscles: list<MuscleGroup>, equipment: Equipment, is_unilateral: bool, uses_bodyweight: bool}>
     */
    public static function all(): array
    {
        return array_map(
            fn (string $name) => ['slug' => Str::slug($name), 'name' => $name] + self::get($name),
            array_keys(self::EXERCISES),
        );
    }

    /** @return array{slug: string, name: string, muscle_group: MuscleGroup, secondary_muscles: list<MuscleGroup>, equipment: Equipment, is_unilateral: bool, uses_bodyweight: bool}|null */
    public static function findBySlug(string $slug): ?array
    {
        foreach (self::all() as $exercise) {
            if ($exercise['slug'] === $slug) {
                return $exercise;
            }
        }

        return null;
    }
}
