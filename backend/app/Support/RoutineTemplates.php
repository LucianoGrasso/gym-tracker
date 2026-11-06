<?php

namespace App\Support;

use App\Enums\SetType;
use App\Enums\TemplateGoal;
use App\Enums\TemplateLevel;

/** Rutinas plantilla que el usuario puede importar. Datos constantes: sin tablas. */
final class RoutineTemplates
{
    /** @return list<array<string, mixed>> */
    public static function all(): array
    {
        return [
            self::nippardPpl(),
            self::arnoldGoldenSix(),
            self::arnoldBlueprint(),
            self::regPark(),
            self::phul(),
            self::ronnieColeman(),
            self::cbum(),
        ];
    }

    /** @return array<string, mixed>|null */
    public static function find(string $slug): ?array
    {
        foreach (self::all() as $template) {
            if ($template['slug'] === $slug) {
                return $template;
            }
        }

        return null;
    }

    private static function nippardPpl(): array
    {
        $n = SetType::Normal;
        $h = SetType::Heavy;

        return self::template('nippard-ppl', 'PPL estilo Jeff Nippard', 'Jeff Nippard',
            'Push/pull/legs de 6 días con base científica: compuestos pesados de 6 a 10 reps, aislamientos de 10 a 20 y casi todas las series cerca del fallo (RIR 1-2).',
            TemplateLevel::Intermediate, TemplateGoal::Hypertrophy, [
                self::day('Lunes – Push A', 1, [
                    ['Press de banca', 3, 5, 8, $h, 180, 'RIR 1-2'],
                    ['Press militar con barra', 3, 8, 10, $n, 150, null],
                    ['Press inclinado con mancuernas', 3, 8, 10, $n, 120, null],
                    ['Elevaciones laterales en polea', 3, 12, 15, $n, 90, 'Última serie al fallo'],
                    ['Extensión de tríceps sobre la cabeza en polea', 3, 10, 12, $n, 90, null],
                ]),
                self::day('Martes – Pull A', 2, [
                    ['Dominadas', 3, 6, 10, $n, 150, 'Con lastre si pasas de 10'],
                    ['Remo con barra', 3, 8, 10, $n, 150, null],
                    ['Remo sentado en polea', 3, 10, 12, $n, 120, null],
                    ['Face pull', 3, 12, 15, $n, 90, null],
                    ['Curl inclinado con mancuernas', 3, 10, 12, $n, 90, null],
                    ['Curl martillo', 2, 10, 12, $n, 90, null],
                ]),
                self::day('Miércoles – Legs A', 3, [
                    ['Sentadilla', 3, 5, 8, $h, 180, 'RIR 1-2'],
                    ['Peso muerto rumano', 3, 8, 10, $n, 150, null],
                    ['Prensa de piernas', 3, 10, 12, $n, 120, null],
                    ['Curl femoral', 3, 10, 12, $n, 90, null],
                    ['Gemelos en máquina', 4, 10, 15, $n, 60, null],
                    ['Elevación de piernas colgado', 3, 10, 15, $n, 60, null],
                ]),
                self::day('Jueves – Push B', 4, [
                    ['Press militar con barra', 3, 6, 8, $h, 180, 'RIR 1-2'],
                    ['Press con mancuernas', 3, 8, 10, $n, 120, null],
                    ['Cruce de poleas', 3, 12, 15, $n, 90, null],
                    ['Elevaciones laterales', 3, 15, 20, $n, 60, 'Última serie al fallo'],
                    ['Press francés', 3, 8, 12, $n, 90, null],
                    ['Extensión de tríceps en polea', 2, 12, 15, $n, 60, null],
                ]),
                self::day('Viernes – Pull B', 5, [
                    ['Jalón al pecho', 3, 8, 12, $n, 120, null],
                    ['Remo con mancuerna', 3, 8, 12, $n, 120, null],
                    ['Pájaros con mancuernas', 3, 15, 20, $n, 60, null],
                    ['Encogimientos con mancuernas', 3, 10, 15, $n, 90, null],
                    ['Curl con barra', 3, 8, 12, $n, 90, null],
                    ['Curl concentrado', 2, 12, 15, $n, 60, null],
                ]),
                self::day('Sábado – Legs B', 6, [
                    ['Sentadilla búlgara', 3, 8, 12, $n, 120, 'Por pierna'],
                    ['Hip thrust', 3, 8, 12, $n, 120, null],
                    ['Extensión de cuádriceps', 3, 12, 15, $n, 90, 'Última serie al fallo'],
                    ['Curl femoral', 3, 12, 15, $n, 90, null],
                    ['Gemelos en máquina', 4, 12, 15, $n, 60, null],
                    ['Crunch abdominal', 3, 12, 15, $n, 60, null],
                ]),
            ]);
    }

    private static function arnoldGoldenSix(): array
    {
        $n = SetType::Normal;
        $exercises = [
            ['Sentadilla', 4, 10, 10, $n, 120, null],
            ['Press de banca', 3, 10, 10, $n, 120, 'Agarre ancho'],
            ['Dominadas', 3, null, null, $n, 120, 'Al máximo de reps'],
            ['Press tras nuca', 4, 10, 10, $n, 120, null],
            ['Curl con barra', 3, 10, 10, $n, 90, null],
            ['Crunch abdominal', 4, null, null, $n, 60, '3-4 series al máximo de reps'],
        ];

        return self::template('arnold-golden-six', 'Golden Six de Arnold', null,
            'La rutina de cuerpo completo que Arnold daba a principiantes: seis ejercicios básicos, tres veces por semana. Ideal para empezar o volver a entrenar.',
            TemplateLevel::Beginner, TemplateGoal::Mixed, [
                self::day('Lunes – Golden Six', 1, $exercises),
                self::day('Miércoles – Golden Six', 3, $exercises),
                self::day('Viernes – Golden Six', 5, $exercises),
            ]);
    }

    private static function arnoldBlueprint(): array
    {
        $n = SetType::Normal;
        $chestBack = [
            ['Press de banca', 4, 8, 12, $n, 90, 'Superserie con dominadas'],
            ['Dominadas', 4, null, null, $n, 90, 'Al máximo de reps, superserie con banca'],
            ['Press inclinado con barra', 4, 8, 12, $n, 90, null],
            ['Remo con barra', 4, 8, 12, $n, 90, null],
            ['Pullover con mancuerna', 3, 10, 12, $n, 90, null],
            ['Peso muerto', 3, 6, 10, $n, 150, null],
            ['Crunch abdominal', 3, 15, 25, $n, 45, null],
        ];
        $shouldersArms = [
            ['Press militar con barra', 4, 8, 12, $n, 90, null],
            ['Elevaciones laterales', 4, 10, 12, $n, 60, null],
            ['Pájaros con mancuernas', 3, 10, 12, $n, 60, null],
            ['Curl con barra', 4, 8, 12, $n, 75, null],
            ['Curl inclinado con mancuernas', 3, 10, 12, $n, 75, null],
            ['Press de banca agarre cerrado', 4, 8, 12, $n, 90, null],
            ['Press francés', 3, 10, 12, $n, 75, null],
        ];
        $legs = [
            ['Sentadilla', 5, 8, 12, $n, 150, null],
            ['Zancadas con mancuernas', 3, 10, 12, $n, 90, 'Por pierna'],
            ['Curl femoral', 4, 10, 12, $n, 75, null],
            ['Peso muerto rumano', 3, 8, 12, $n, 120, 'Piernas casi rectas'],
            ['Gemelos en máquina', 5, 10, 15, $n, 45, null],
        ];

        return self::template('arnold-blueprint', 'Split estilo Arnold (Blueprint)', 'Arnold Schwarzenegger',
            'Doble split clásico de los 70: pecho y espalda, hombros y brazos, y piernas, dos veces por semana. Mucho volumen y superseries de pecho con espalda.',
            TemplateLevel::Advanced, TemplateGoal::Hypertrophy, [
                self::day('Lunes – Pecho y espalda', 1, $chestBack),
                self::day('Martes – Hombros y brazos', 2, $shouldersArms),
                self::day('Miércoles – Piernas', 3, $legs),
                self::day('Jueves – Pecho y espalda', 4, $chestBack),
                self::day('Viernes – Hombros y brazos', 5, $shouldersArms),
                self::day('Sábado – Piernas', 6, $legs),
            ]);
    }

    private static function regPark(): array
    {
        $h = SetType::Heavy;
        $note = '2 de calentamiento + 3 efectivas';
        $exercises = [
            ['Sentadilla', 5, 5, 5, $h, 180, $note],
            ['Press de banca', 5, 5, 5, $h, 180, $note],
            ['Peso muerto', 5, 5, 5, $h, 180, $note],
        ];

        return self::template('reg-park-5x5', '5×5 de Reg Park', null,
            'El programa de fuerza con el que Reg Park, mentor de Arnold, construía la base: tres básicos 5×5, tres veces por semana. Sube el peso cuando completes las 3 series efectivas.',
            TemplateLevel::Beginner, TemplateGoal::Strength, [
                self::day('Lunes – 5×5', 1, $exercises),
                self::day('Miércoles – 5×5', 3, $exercises),
                self::day('Viernes – 5×5', 5, $exercises),
            ]);
    }

    private static function phul(): array
    {
        $n = SetType::Normal;
        $h = SetType::Heavy;

        return self::template('phul', 'PHUL', null,
            'Power Hypertrophy Upper Lower: dos días de fuerza pesada y dos de hipertrofia, dividiendo tren superior e inferior.',
            TemplateLevel::Intermediate, TemplateGoal::Mixed, [
                self::day('Lunes – Superior potencia', 1, [
                    ['Press de banca', 4, 3, 5, $h, 180, '3-4 series'],
                    ['Press inclinado con mancuernas', 4, 6, 10, $n, 120, '3-4 series'],
                    ['Remo con barra', 4, 3, 5, $h, 180, '3-4 series'],
                    ['Jalón al pecho', 4, 6, 10, $n, 120, '3-4 series'],
                    ['Press militar con barra', 3, 5, 8, $n, 150, '2-3 series'],
                    ['Curl con barra', 3, 6, 10, $n, 90, '2-3 series'],
                    ['Press francés', 3, 6, 10, $n, 90, '2-3 series'],
                ]),
                self::day('Martes – Inferior potencia', 2, [
                    ['Sentadilla', 4, 3, 5, $h, 180, '3-4 series'],
                    ['Peso muerto', 4, 3, 5, $h, 180, '3-4 series'],
                    ['Prensa de piernas', 5, 10, 15, $n, 120, '3-5 series'],
                    ['Curl femoral', 4, 6, 10, $n, 90, '3-4 series'],
                    ['Gemelos en máquina', 4, 6, 10, $n, 60, null],
                ]),
                self::day('Jueves – Superior hipertrofia', 4, [
                    ['Press inclinado con barra', 4, 8, 12, $n, 90, '3-4 series'],
                    ['Aperturas con mancuernas', 4, 8, 12, $n, 75, '3-4 series'],
                    ['Remo sentado en polea', 4, 8, 12, $n, 90, '3-4 series'],
                    ['Remo con mancuerna', 4, 8, 12, $n, 90, '3-4 series'],
                    ['Elevaciones laterales', 4, 8, 12, $n, 60, '3-4 series'],
                    ['Curl inclinado con mancuernas', 4, 8, 12, $n, 60, '3-4 series'],
                    ['Extensión de tríceps en polea', 4, 8, 12, $n, 60, '3-4 series'],
                ]),
                self::day('Viernes – Inferior hipertrofia', 5, [
                    ['Sentadilla frontal', 4, 8, 12, $n, 120, '3-4 series'],
                    ['Zancadas con mancuernas', 4, 8, 12, $n, 90, '3-4 series, por pierna'],
                    ['Extensión de cuádriceps', 4, 10, 15, $n, 60, '3-4 series'],
                    ['Curl femoral', 4, 10, 15, $n, 60, '3-4 series'],
                    ['Gemelos en máquina', 4, 8, 12, $n, 60, '3-4 series'],
                ]),
            ]);
    }

    private static function ronnieColeman(): array
    {
        $n = SetType::Normal;
        $h = SetType::Heavy;
        $pyramid = 'Pirámide: sube el peso en cada serie';

        return self::template('ronnie-coleman', 'Estilo Ronnie Coleman', 'Ronnie Coleman',
            'Split de 6 días al estilo del 8 veces Mr. Olympia: básicos muy pesados en pirámide y mucho volumen. Exigente: para avanzados.',
            TemplateLevel::Advanced, TemplateGoal::Hypertrophy, [
                self::day('Lunes – Espalda, bíceps y hombros', 1, [
                    ['Peso muerto', 4, 6, 10, $h, 180, $pyramid],
                    ['Remo con barra', 4, 10, 12, $n, 120, null],
                    ['Remo en T', 3, 10, 12, $n, 120, null],
                    ['Remo con mancuerna', 3, 10, 12, $n, 90, null],
                    ['Curl con barra', 4, 10, 12, $n, 90, null],
                    ['Curl martillo', 3, 10, 12, $n, 75, null],
                    ['Press militar con barra', 4, 10, 12, $n, 120, null],
                    ['Elevaciones laterales', 3, 12, 15, $n, 60, null],
                ]),
                self::day('Martes – Piernas', 2, [
                    ['Sentadilla', 5, 6, 12, $h, 180, $pyramid],
                    ['Prensa de piernas', 4, 12, 15, $n, 120, null],
                    ['Zancadas con mancuernas', 2, null, null, $n, 120, 'Caminando, ~50 pasos por serie'],
                    ['Extensión de cuádriceps', 3, 12, 15, $n, 75, null],
                    ['Peso muerto rumano', 3, 10, 12, $n, 120, null],
                    ['Curl femoral', 3, 12, 15, $n, 75, null],
                ]),
                self::day('Miércoles – Pecho y tríceps', 3, [
                    ['Press de banca', 5, 6, 12, $h, 180, $pyramid],
                    ['Press inclinado con barra', 3, 10, 12, $n, 120, null],
                    ['Press con mancuernas', 3, 10, 12, $n, 120, null],
                    ['Aperturas con mancuernas', 3, 12, 15, $n, 75, null],
                    ['Press francés', 3, 10, 12, $n, 90, null],
                    ['Press de banca agarre cerrado', 3, 10, 12, $n, 90, null],
                    ['Fondos', 3, null, null, $n, 90, 'Al máximo de reps'],
                ]),
                self::day('Jueves – Espalda, bíceps y hombros', 4, [
                    ['Dominadas', 4, null, null, $n, 120, 'Al máximo de reps'],
                    ['Jalón al pecho', 4, 10, 12, $n, 90, null],
                    ['Remo sentado en polea', 3, 10, 12, $n, 90, null],
                    ['Encogimientos con mancuernas', 3, 12, 15, $n, 75, null],
                    ['Curl concentrado', 3, 10, 12, $n, 60, null],
                    ['Press tras nuca', 4, 10, 12, $n, 120, null],
                    ['Elevaciones laterales en polea', 3, 12, 15, $n, 60, null],
                ]),
                self::day('Viernes – Piernas', 5, [
                    ['Sentadilla frontal', 4, 8, 12, $n, 150, null],
                    ['Sentadilla hack', 4, 10, 12, $n, 120, null],
                    ['Extensión de cuádriceps', 3, 12, 15, $n, 75, null],
                    ['Curl femoral', 4, 10, 12, $n, 75, null],
                    ['Gemelos en máquina', 4, 12, 15, $n, 60, null],
                ]),
                self::day('Sábado – Pecho y tríceps', 6, [
                    ['Press inclinado con mancuernas', 4, 10, 12, $n, 120, null],
                    ['Press de banca', 4, 8, 12, $n, 150, null],
                    ['Cruce de poleas', 3, 12, 15, $n, 75, null],
                    ['Extensión de tríceps en polea', 4, 10, 12, $n, 75, null],
                    ['Extensión de tríceps sobre la cabeza en polea', 3, 10, 12, $n, 75, null],
                ]),
            ]);
    }

    private static function cbum(): array
    {
        $n = SetType::Normal;
        $tempo = 'Tempo: 3 s bajando';

        return self::template('cbum', 'Estilo Chris Bumstead', 'Chris Bumstead',
            'Split de 5 días al estilo del 6 veces Mr. Olympia Classic Physique: hipertrofia clásica, tempo controlado y énfasis en la conexión mente-músculo.',
            TemplateLevel::Intermediate, TemplateGoal::Hypertrophy, [
                self::day('Lunes – Push', 1, [
                    ['Press inclinado con mancuernas', 3, 8, 12, $n, 150, $tempo],
                    ['Press de pecho en máquina', 3, 8, 12, $n, 120, null],
                    ['Cruce de poleas', 3, 10, 15, $n, 90, null],
                    ['Press de hombro con mancuernas', 3, 8, 12, $n, 120, null],
                    ['Elevaciones laterales en polea', 3, 12, 15, $n, 60, null],
                    ['Extensión de tríceps en polea', 3, 10, 12, $n, 60, null],
                ]),
                self::day('Martes – Pull', 2, [
                    ['Jalón al pecho', 3, 8, 12, $n, 120, $tempo],
                    ['Remo con barra', 3, 8, 12, $n, 120, null],
                    ['Remo sentado en polea', 3, 10, 12, $n, 90, null],
                    ['Pájaros con mancuernas', 3, 12, 15, $n, 60, null],
                    ['Curl con barra', 3, 8, 12, $n, 75, null],
                    ['Curl martillo', 3, 10, 12, $n, 60, null],
                ]),
                self::day('Jueves – Piernas (cuádriceps)', 4, [
                    ['Extensión de cuádriceps', 2, 12, 15, $n, 60, 'Para calentar las rodillas'],
                    ['Sentadilla hack', 3, 6, 10, $n, 180, $tempo],
                    ['Prensa de piernas', 3, 10, 12, $n, 150, null],
                    ['Sentadilla búlgara', 2, 8, 12, $n, 120, 'Por pierna'],
                    ['Gemelos en máquina', 4, 10, 15, $n, 60, null],
                ]),
                self::day('Viernes – Tren superior', 5, [
                    ['Press de banca', 3, 6, 10, $n, 150, null],
                    ['Dominadas', 3, 6, 10, $n, 150, null],
                    ['Press militar con barra', 3, 8, 10, $n, 120, null],
                    ['Remo con mancuerna', 3, 8, 12, $n, 90, null],
                    ['Elevaciones laterales', 3, 12, 15, $n, 60, null],
                    ['Curl inclinado con mancuernas', 3, 10, 12, $n, 60, null],
                    ['Press francés', 3, 10, 12, $n, 60, null],
                ]),
                self::day('Sábado – Piernas (femorales y glúteos)', 6, [
                    ['Peso muerto rumano', 3, 6, 10, $n, 180, $tempo],
                    ['Curl femoral', 3, 10, 12, $n, 90, null],
                    ['Hip thrust', 3, 8, 12, $n, 120, null],
                    ['Zancadas con mancuernas', 2, 10, 12, $n, 90, 'Por pierna'],
                    ['Hiperextensiones', 2, 12, 15, $n, 60, null],
                    ['Gemelos en máquina', 4, 10, 15, $n, 60, null],
                ]),
            ]);
    }

    /** @param list<array<string, mixed>> $days */
    private static function template(
        string $slug, string $name, ?string $inspiredBy, string $description,
        TemplateLevel $level, TemplateGoal $goal, array $days,
    ): array {
        return [
            'slug' => $slug,
            'name' => $name,
            'inspired_by' => $inspiredBy,
            'description' => $description,
            'days_per_week' => count($days),
            'level' => $level,
            'goal' => $goal,
            'days' => $days,
        ];
    }

    /** @param list<array{0: string, 1: int, 2: ?int, 3: ?int, 4: SetType, 5: int, 6: ?string}> $rows */
    private static function day(string $name, ?int $weekday, array $rows): array
    {
        return [
            'name' => $name,
            'weekday' => $weekday,
            'exercises' => array_map(fn (array $r) => [
                'name' => $r[0],
                'muscle_group' => ExerciseCatalog::get($r[0])['muscle_group'],
                'target_sets' => $r[1],
                'target_reps_min' => $r[2],
                'target_reps_max' => $r[3],
                'default_set_type' => $r[4],
                'rest_seconds' => $r[5],
                'target_text' => $r[6],
            ], $rows),
        ];
    }
}
