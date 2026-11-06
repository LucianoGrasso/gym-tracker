# Plantillas de rutinas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** catálogo de 7 rutinas plantilla (Nippard, Arnold ×2, Reg Park, PHUL, Ronnie Coleman, Chris Bumstead) que el usuario ve en la app e importa a sus rutinas con un toque, sin activarlas.

**Architecture:** las plantillas son datos constantes en PHP (`App\Support\RoutineTemplates`), con un catálogo de ejercicios compartido con el seeder (`App\Support\ExerciseCatalog`). Dos endpoints: `GET /api/routine-templates` y `POST /api/routine-templates/{slug}/import`, con la lógica en `App\Services\RoutineTemplateImporter`. En el frontend hay dos pantallas lazy (catálogo y detalle) bajo `/rutinas/plantillas`.

**Tech Stack:** Laravel 13 + Pest; Angular 22 (standalone, signals, OnPush) + Vitest; spartan/ui.

Spec: `docs/superpowers/specs/2026-11-06-plantillas-de-rutinas-design.md`.

**Desvío de la spec:** el catálogo de ejercicios va en su propia clase, `App\Support\ExerciseCatalog`, y no dentro de `RoutineTemplates`. Lo usan tanto el seeder como las plantillas, y así cada archivo tiene una sola responsabilidad. El catálogo suma 32 ejercicios nuevos (la spec decía "unos 25").

## Global Constraints

- Código, tablas y variables en inglés; textos de UI en español (Chile). kg, `dd/mm/aaaa`, `America/Santiago`, decimales con coma.
- Enums como string en inglés (`App\Enums`); la UI los traduce.
- Modelos de usuario usan `BelongsToUser`. Toda consulta queda restringida al usuario.
- Sin lógica en controladores (la importación vive en `App\Services`).
- Laravel apto para Lambda: sin escribir archivos en disco.
- Importar **no activa** la rutina.
- Plantillas "inspiradas en" muestran "Inspirada en X"; no se copia material de pago.
- TDD: test que falla → implementación mínima → test en verde → commit (uno por tarea, en la rama `plantillas-rutinas`).
- Tests: `cd backend && ./vendor/bin/pest` · `cd frontend && npx ng test --watch=false`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `backend/app/Enums/TemplateLevel.php` | `beginner` / `intermediate` / `advanced` |
| `backend/app/Enums/TemplateGoal.php` | `strength` / `hypertrophy` / `mixed` |
| `backend/app/Support/ExerciseCatalog.php` | 47 ejercicios: nombre → grupo, equipamiento, unilateral, peso corporal |
| `backend/app/Support/RoutineTemplates.php` | Las 7 plantillas y `all()` / `find()` |
| `backend/database/seeders/GymTrackerSeeder.php` | Lee sus 15 ejercicios desde `ExerciseCatalog` |
| `backend/app/Services/RoutineTemplateImporter.php` | Importa una plantilla para un usuario (transacción) |
| `backend/app/Http/Controllers/RoutineTemplateController.php` | `index` e `import` |
| `backend/routes/api.php` | 2 rutas nuevas |
| `backend/tests/Unit/RoutineTemplatesTest.php` | Integridad del catálogo |
| `backend/tests/Feature/Api/RoutineTemplatesTest.php` | Endpoints e importación |
| `frontend/src/app/core/models/routine-template.ts` | Tipos `RoutineTemplate`, `TemplateDay`, `TemplateExercise` |
| `frontend/src/app/core/models/labels.ts` | `TEMPLATE_LEVEL_LABELS`, `TEMPLATE_GOAL_LABELS` |
| `frontend/src/app/core/api/routine-templates-api.ts` (+ spec) | `list()` con caché, `find(slug)`, `import(slug)` |
| `frontend/src/app/features/routines/templates-page.ts` (+ spec) | Catálogo |
| `frontend/src/app/features/routines/template-detail-page.ts` (+ spec) | Detalle e importar |
| `frontend/src/app/app.routes.ts` | Rutas `plantillas` y `plantillas/:slug` antes de `:id` |
| `frontend/src/app/features/routines/routines-page.ts` | Botón "Explorar plantillas" |
| `frontend/src/app/features/routines/routine-detail-page.ts` | Aviso "Rutina agregada…" con `?agregada=1` |

---

### Task 1: Catálogo de ejercicios y las 7 plantillas (datos + integridad)

**Files:**
- Create: `backend/app/Enums/TemplateLevel.php`, `backend/app/Enums/TemplateGoal.php`, `backend/app/Support/ExerciseCatalog.php`, `backend/app/Support/RoutineTemplates.php`
- Modify: `backend/database/seeders/GymTrackerSeeder.php` (const `EXERCISES` y su uso en `run`)
- Test: `backend/tests/Unit/RoutineTemplatesTest.php`; `backend/tests/Feature/Seeders/GymTrackerSeederTest.php` (ya existe, debe seguir en verde)

**Interfaces:**
- Produces:
  - `ExerciseCatalog::get(string $name): array{muscle_group: MuscleGroup, equipment: Equipment, is_unilateral: bool, uses_bodyweight: bool}` (lanza `InvalidArgumentException` si no existe)
  - `ExerciseCatalog::has(string $name): bool`
  - `RoutineTemplates::all(): list<array>` con forma `{slug, name, inspired_by: ?string, description, days_per_week: int, level: TemplateLevel, goal: TemplateGoal, days: list<{name, weekday: ?int, exercises: list<{name, muscle_group: MuscleGroup, target_sets, target_reps_min: ?int, target_reps_max: ?int, default_set_type: SetType, rest_seconds, target_text: ?string}>}>}`
  - `RoutineTemplates::find(string $slug): ?array`

- [ ] **Step 1: Write the failing test** — `backend/tests/Unit/RoutineTemplatesTest.php`

```php
<?php

use App\Enums\SetType;
use App\Support\ExerciseCatalog;
use App\Support\RoutineTemplates;

it('offers the seven agreed templates with unique slugs', function () {
    expect(array_column(RoutineTemplates::all(), 'slug'))->toBe([
        'nippard-ppl', 'arnold-golden-six', 'arnold-blueprint', 'reg-park-5x5', 'phul', 'ronnie-coleman', 'cbum',
    ]);
});

it('marks athlete-inspired templates', function () {
    expect(RoutineTemplates::find('nippard-ppl')['inspired_by'])->toBe('Jeff Nippard')
        ->and(RoutineTemplates::find('cbum')['inspired_by'])->toBe('Chris Bumstead')
        ->and(RoutineTemplates::find('phul')['inspired_by'])->toBeNull()
        ->and(RoutineTemplates::find('nope'))->toBeNull();
});

it('keeps every template consistent and within API limits', function () {
    foreach (RoutineTemplates::all() as $template) {
        expect($template['days_per_week'])->toBe(count($template['days']));
        foreach ($template['days'] as $day) {
            expect($day['weekday'] === null || ($day['weekday'] >= 1 && $day['weekday'] <= 7))->toBeTrue()
                ->and($day['exercises'])->not->toBeEmpty();
            foreach ($day['exercises'] as $e) {
                $label = "{$template['slug']} / {$day['name']} / {$e['name']}";
                expect(ExerciseCatalog::has($e['name']))->toBeTrue($label)
                    ->and($e['target_sets'])->toBeGreaterThanOrEqual(1)->toBeLessThanOrEqual(20)
                    ->and($e['rest_seconds'])->toBeGreaterThanOrEqual(0)->toBeLessThanOrEqual(900)
                    ->and($e['default_set_type'])->toBeInstanceOf(SetType::class)
                    ->and(($e['target_reps_min'] === null) === ($e['target_reps_max'] === null))->toBeTrue($label);
                if ($e['target_reps_min'] !== null) {
                    expect($e['target_reps_min'])->toBeGreaterThanOrEqual(1)
                        ->and($e['target_reps_max'])->toBeLessThanOrEqual(100)
                        ->and($e['target_reps_min'])->toBeLessThanOrEqual($e['target_reps_max']);
                } else {
                    expect($e['target_text'])->not->toBeNull($label);
                }
                expect(mb_strlen((string) $e['target_text']))->toBeLessThanOrEqual(150);
            }
        }
    }
});

it('follows the published Golden Six', function () {
    $template = RoutineTemplates::find('arnold-golden-six');

    expect(array_column($template['days'][0]['exercises'], 'name'))->toBe([
        'Sentadilla', 'Press de banca', 'Dominadas', 'Press tras nuca', 'Curl con barra', 'Crunch abdominal',
    ])->and(array_column($template['days'], 'weekday'))->toBe([1, 3, 5]);
});
```

Los límites vienen de `RoutineDayExerciseRequest`: series de 1 a 20, reps de 1 a 100, descanso de 0 a 900 y `target_text` de hasta 150 caracteres.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./vendor/bin/pest tests/Unit/RoutineTemplatesTest.php`
Expected: FAIL con `Class "App\Support\RoutineTemplates" not found`.

> `tests/Unit` no usa el `TestCase` de Laravel (`tests/Pest.php` solo lo extiende en `Feature`). Estas clases no tocan la BD ni el contenedor, así que corren como test unitario puro.

- [ ] **Step 3: Create the enums**

`backend/app/Enums/TemplateLevel.php`:

```php
<?php

namespace App\Enums;

enum TemplateLevel: string
{
    case Beginner = 'beginner';
    case Intermediate = 'intermediate';
    case Advanced = 'advanced';
}
```

`backend/app/Enums/TemplateGoal.php`:

```php
<?php

namespace App\Enums;

enum TemplateGoal: string
{
    case Strength = 'strength';
    case Hypertrophy = 'hypertrophy';
    case Mixed = 'mixed';
}
```

- [ ] **Step 4: Create `backend/app/Support/ExerciseCatalog.php`**

```php
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
```

- [ ] **Step 5: Create `backend/app/Support/RoutineTemplates.php`**

Filas: `[ejercicio, series, reps_min, reps_max, tipo, descanso_seg, nota]`. Si la fuente da un rango de series, `series` toma el máximo y el rango va en la nota.

```php
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
```

- [ ] **Step 6: Point `GymTrackerSeeder` at the catalog**

En `backend/database/seeders/GymTrackerSeeder.php`, reemplazar la constante `EXERCISES` (con su docblock) por la lista de nombres:

```php
    /** Los 15 ejercicios iniciales; sus datos vienen de ExerciseCatalog. */
    private const EXERCISES = [
        'Press de banca', 'Press con mancuernas', 'Press inclinado con mancuernas', 'Elevaciones laterales',
        'Dominadas', 'Remo con mancuerna', 'Jalón al pecho', 'Curl de bíceps con mancuernas', 'Fondos',
        'Press de hombro con mancuernas', 'Extensión de tríceps en polea', 'Sentadilla', 'Peso muerto rumano',
        'Curl femoral', 'Gemelos en máquina',
    ];
```

Y en `run()` reemplazar el bloque `$exercises = collect(self::EXERCISES)->map(...)` por:

```php
        $exercises = collect(self::EXERCISES)->mapWithKeys(
            fn (string $name) => [$name => Exercise::create(['user_id' => $user->id, 'name' => $name] + ExerciseCatalog::get($name))]
        );
```

Agregar `use App\Support\ExerciseCatalog;` y quitar `use App\Enums\Equipment;` y `use App\Enums\MuscleGroup;` si ya no se usan.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest tests/Unit/RoutineTemplatesTest.php tests/Feature/Seeders tests/Feature/Console`
Expected: PASS (el seeder sigue creando 15 ejercicios y la rutina de 4 días).

- [ ] **Step 8: Commit**

```bash
git add backend/app/Enums/TemplateLevel.php backend/app/Enums/TemplateGoal.php backend/app/Support backend/database/seeders/GymTrackerSeeder.php backend/tests/Unit/RoutineTemplatesTest.php
git commit -m "feat(templates): add exercise catalog and seven routine templates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Endpoints de catálogo e importación

**Files:**
- Create: `backend/app/Services/RoutineTemplateImporter.php`, `backend/app/Http/Controllers/RoutineTemplateController.php`
- Modify: `backend/routes/api.php` (import + 2 rutas dentro del grupo `auth:sanctum`)
- Test: `backend/tests/Feature/Api/RoutineTemplatesTest.php`

**Interfaces:**
- Consumes: `RoutineTemplates::all()`, `RoutineTemplates::find()`, `ExerciseCatalog::get()` (Task 1)
- Produces:
  - `GET /api/routine-templates` → `{ data: RoutineTemplate[] }` (forma de `RoutineTemplates::all()`, enums como string)
  - `POST /api/routine-templates/{slug}/import` → 201 `{ data: Routine }` (`RoutineResource` con `days.exercises.exercise`) · 404
  - `RoutineTemplateImporter::import(User $user, array $template): Routine`

- [ ] **Step 1: Write the failing tests** — `backend/tests/Feature/Api/RoutineTemplatesTest.php`

```php
<?php

use App\Enums\MuscleGroup;
use App\Models\Exercise;
use App\Models\Routine;
use App\Models\User;
use App\Support\RoutineTemplates;

beforeEach(function () {
    $this->user = User::factory()->create();
});

it('requires authentication', function () {
    $this->getJson('/api/routine-templates')->assertUnauthorized();
    $this->postJson('/api/routine-templates/phul/import')->assertUnauthorized();
});

it('lists the templates with days and exercises', function () {
    $this->actingAs($this->user)->getJson('/api/routine-templates')
        ->assertOk()
        ->assertJsonCount(7, 'data')
        ->assertJsonPath('data.0.slug', 'nippard-ppl')
        ->assertJsonPath('data.0.inspired_by', 'Jeff Nippard')
        ->assertJsonPath('data.0.level', 'intermediate')
        ->assertJsonPath('data.0.goal', 'hypertrophy')
        ->assertJsonPath('data.0.days_per_week', 6)
        ->assertJsonPath('data.0.days.0.exercises.0.name', 'Press de banca')
        ->assertJsonPath('data.0.days.0.exercises.0.muscle_group', 'chest')
        ->assertJsonPath('data.0.days.0.exercises.0.default_set_type', 'heavy');
});

it('imports a template as an inactive routine with ordered days and exercises', function () {
    $active = Routine::factory()->for($this->user)->create(['name' => 'Mi rutina', 'is_active' => true]);

    $response = $this->actingAs($this->user)->postJson('/api/routine-templates/phul/import')
        ->assertCreated()
        ->assertJsonPath('data.name', 'PHUL')
        ->assertJsonPath('data.is_active', false)
        ->assertJsonPath('data.days.*.name', [
            'Lunes – Superior potencia', 'Martes – Inferior potencia',
            'Jueves – Superior hipertrofia', 'Viernes – Inferior hipertrofia',
        ])
        ->assertJsonPath('data.days.0.exercises.0.exercise.name', 'Press de banca')
        ->assertJsonPath('data.days.0.exercises.0.target_text', '3-4 series');

    $routine = Routine::find($response->json('data.id'));
    $template = RoutineTemplates::find('phul');
    expect($routine->days->pluck('weekday')->all())->toBe([1, 2, 4, 5])
        ->and($routine->days[0]->exercises->pluck('position')->all())->toBe(range(0, count($template['days'][0]['exercises']) - 1))
        ->and($active->fresh()->is_active)->toBeTrue()
        ->and($routine->notes)->toBe($template['description']);
});

it('notes who inspired the routine', function () {
    $this->actingAs($this->user)->postJson('/api/routine-templates/cbum/import')
        ->assertCreated()
        ->assertJsonPath('data.notes', RoutineTemplates::find('cbum')['description']."\nInspirada en Chris Bumstead.");
});

it('reuses the user exercises by name, ignoring case and spaces', function () {
    $bench = Exercise::factory()->for($this->user)->create(['name' => '  press DE banca ']);

    $this->actingAs($this->user)->postJson('/api/routine-templates/reg-park-5x5/import')->assertCreated();

    expect(Exercise::where('user_id', $this->user->id)->count())->toBe(3)
        ->and(Routine::where('name', '5×5 de Reg Park')->sole()->days[0]->exercises[1]->exercise_id)->toBe($bench->id);
});

it('restores an archived exercise the template uses', function () {
    $squat = Exercise::factory()->for($this->user)->create(['name' => 'Sentadilla', 'archived_at' => now()]);

    $this->actingAs($this->user)->postJson('/api/routine-templates/reg-park-5x5/import')->assertCreated();

    expect($squat->fresh()->archived_at)->toBeNull();
});

it('creates missing exercises from the catalog', function () {
    $this->actingAs($this->user)->postJson('/api/routine-templates/arnold-golden-six/import')->assertCreated();

    $pullUps = Exercise::where('user_id', $this->user->id)->where('name', 'Dominadas')->sole();
    expect($pullUps->muscle_group)->toBe(MuscleGroup::Back)
        ->and($pullUps->uses_bodyweight)->toBeTrue()
        ->and(Exercise::where('user_id', $this->user->id)->count())->toBe(6);
});

it('adds a suffix when the routine name is taken', function () {
    $this->actingAs($this->user);
    $this->postJson('/api/routine-templates/phul/import')->assertJsonPath('data.name', 'PHUL');
    $this->postJson('/api/routine-templates/phul/import')->assertJsonPath('data.name', 'PHUL (2)');
    $this->postJson('/api/routine-templates/phul/import')->assertJsonPath('data.name', 'PHUL (3)');

    expect(Exercise::where('user_id', $this->user->id)->where('name', 'Press de banca')->count())->toBe(1);
});

it('returns 404 for an unknown template', function () {
    $this->actingAs($this->user)->postJson('/api/routine-templates/no-existe/import')->assertNotFound();
});

it('never uses another user exercises or routine names', function () {
    $other = User::factory()->create();
    Exercise::factory()->for($other)->create(['name' => 'Sentadilla']);
    Routine::factory()->for($other)->create(['name' => '5×5 de Reg Park']);

    $this->actingAs($this->user)->postJson('/api/routine-templates/reg-park-5x5/import')
        ->assertJsonPath('data.name', '5×5 de Reg Park');

    expect(Exercise::where('user_id', $this->user->id)->where('name', 'Sentadilla')->count())->toBe(1)
        ->and(Exercise::where('user_id', $other->id)->count())->toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/RoutineTemplatesTest.php`
Expected: FAIL, 404 en las rutas (todavía no existen).

- [ ] **Step 3: Create `backend/app/Services/RoutineTemplateImporter.php`**

```php
<?php

namespace App\Services;

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\User;
use App\Support\ExerciseCatalog;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Copia una plantilla como rutina del usuario (inactiva), reutilizando sus ejercicios por nombre. */
class RoutineTemplateImporter
{
    /** @param array<string, mixed> $template una entrada de RoutineTemplates::all() */
    public function import(User $user, array $template): Routine
    {
        return DB::transaction(function () use ($user, $template) {
            $routine = Routine::create([
                'user_id' => $user->id,
                'name' => $this->uniqueName($user, $template['name']),
                'notes' => $template['description'].($template['inspired_by'] ? "\nInspirada en {$template['inspired_by']}." : ''),
                'is_active' => false,
            ]);

            $exercises = $this->resolveExercises($user, $template);

            foreach ($template['days'] as $position => $day) {
                $routineDay = $routine->days()->create([
                    'name' => $day['name'],
                    'weekday' => $day['weekday'],
                    'position' => $position,
                ]);
                foreach ($day['exercises'] as $i => $item) {
                    $routineDay->exercises()->create([
                        'exercise_id' => $exercises[$item['name']]->id,
                        'position' => $i,
                        'target_sets' => $item['target_sets'],
                        'target_reps_min' => $item['target_reps_min'],
                        'target_reps_max' => $item['target_reps_max'],
                        'default_set_type' => $item['default_set_type'],
                        'rest_seconds' => $item['rest_seconds'],
                        'target_text' => $item['target_text'],
                    ]);
                }
            }

            return $routine->load('days.exercises.exercise');
        });
    }

    private function uniqueName(User $user, string $name): string
    {
        $taken = Routine::withoutGlobalScopes()->where('user_id', $user->id)->pluck('name')->all();
        $candidate = $name;
        for ($n = 2; in_array($candidate, $taken, true); $n++) {
            $candidate = "{$name} ({$n})";
        }

        return $candidate;
    }

    /** @return Collection<string, Exercise> nombre de la plantilla => ejercicio del usuario */
    private function resolveExercises(User $user, array $template): Collection
    {
        $owned = Exercise::withoutGlobalScopes()->where('user_id', $user->id)->get()
            ->keyBy(fn (Exercise $e) => $this->key($e->name));

        return collect($template['days'])
            ->flatMap(fn (array $day) => array_column($day['exercises'], 'name'))
            ->unique()
            ->mapWithKeys(function (string $name) use ($user, $owned) {
                $exercise = $owned->get($this->key($name));
                if ($exercise === null) {
                    $exercise = Exercise::create(['user_id' => $user->id, 'name' => $name] + ExerciseCatalog::get($name));
                } elseif ($exercise->archived_at !== null) {
                    $exercise->update(['archived_at' => null]);
                }

                return [$name => $exercise];
            });
    }

    private function key(string $name): string
    {
        return Str::lower(trim($name));
    }
}
```

- [ ] **Step 4: Create `backend/app/Http/Controllers/RoutineTemplateController.php`**

```php
<?php

namespace App\Http\Controllers;

use App\Http\Resources\RoutineResource;
use App\Services\RoutineTemplateImporter;
use App\Support\RoutineTemplates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoutineTemplateController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => RoutineTemplates::all()]);
    }

    public function import(Request $request, string $slug, RoutineTemplateImporter $importer): JsonResponse
    {
        $template = RoutineTemplates::find($slug);
        abort_if($template === null, 404);

        return (new RoutineResource($importer->import($request->user(), $template)))
            ->response()
            ->setStatusCode(201);
    }
}
```

- [ ] **Step 5: Register the routes** — `backend/routes/api.php`

Agregar `use App\Http\Controllers\RoutineTemplateController;` junto a los demás `use` y, dentro de `Route::middleware('auth:sanctum')->group(...)`, justo antes de `Route::get('/routines', ...)`:

```php
    Route::get('/routine-templates', [RoutineTemplateController::class, 'index']);
    Route::post('/routine-templates/{slug}/import', [RoutineTemplateController::class, 'import']);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/RoutineTemplatesTest.php`
Expected: PASS (11 tests).

Run: `cd backend && ./vendor/bin/pest`
Expected: la suite completa en verde.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Services/RoutineTemplateImporter.php backend/app/Http/Controllers/RoutineTemplateController.php backend/routes/api.php backend/tests/Feature/Api/RoutineTemplatesTest.php
git commit -m "feat(templates): list routine templates and import them as inactive routines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Modelos, etiquetas y servicio API del frontend

**Files:**
- Create: `frontend/src/app/core/models/routine-template.ts`, `frontend/src/app/core/api/routine-templates-api.ts`
- Modify: `frontend/src/app/core/models/labels.ts` (import + al final)
- Test: `frontend/src/app/core/api/routine-templates-api.spec.ts`

**Interfaces:**
- Consumes: `GET /api/routine-templates`, `POST /api/routine-templates/{slug}/import` (Task 2)
- Produces:
  - tipos `RoutineTemplate`, `TemplateDay`, `TemplateExercise`, `TemplateLevel`, `TemplateGoal`
  - `TEMPLATE_LEVEL_LABELS: Record<TemplateLevel, string>`, `TEMPLATE_GOAL_LABELS: Record<TemplateGoal, string>`
  - `RoutineTemplatesApi.list(): Promise<RoutineTemplate[]>` (una sola petición por sesión; si falla, la siguiente llamada reintenta)
  - `RoutineTemplatesApi.find(slug: string): Promise<RoutineTemplate | undefined>`
  - `RoutineTemplatesApi.import(slug: string): Promise<Routine>`

- [ ] **Step 1: Write the failing test** — `frontend/src/app/core/api/routine-templates-api.spec.ts`

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '../models/routine-template';
import { RoutineTemplatesApi } from './routine-templates-api';

const phul = { slug: 'phul', name: 'PHUL', days: [] } as unknown as RoutineTemplate;

describe('RoutineTemplatesApi', () => {
  let api: RoutineTemplatesApi;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(RoutineTemplatesApi);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('loads the catalog once and finds a template by slug', async () => {
    const first = api.list();
    mock.expectOne('/api/routine-templates').flush({ data: [phul] });
    expect(await first).toEqual([phul]);

    expect(await api.find('phul')).toEqual(phul);
    expect(await api.find('nope')).toBeUndefined();
    mock.expectNone('/api/routine-templates');
  });

  it('retries the catalog after a failure', async () => {
    const failed = api.list();
    mock.expectOne('/api/routine-templates').flush(null, { status: 500, statusText: 'Error' });
    await expect(failed).rejects.toBeTruthy();

    const retry = api.list();
    mock.expectOne('/api/routine-templates').flush({ data: [phul] });
    expect(await retry).toEqual([phul]);
  });

  it('imports a template and returns the new routine', async () => {
    const result = api.import('phul');
    const req = mock.expectOne('/api/routine-templates/phul/import');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { id: 42, name: 'PHUL', notes: null, is_active: false } }, { status: 201, statusText: 'Created' });
    expect((await result).id).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include src/app/core/api/routine-templates-api.spec.ts`
Expected: FAIL, no se resuelve `./routine-templates-api`.

- [ ] **Step 3: Create the models** — `frontend/src/app/core/models/routine-template.ts`

```ts
import type { MuscleGroup, SetType } from './exercise';

export type TemplateLevel = 'beginner' | 'intermediate' | 'advanced';
export type TemplateGoal = 'strength' | 'hypertrophy' | 'mixed';

export interface TemplateExercise {
  name: string;
  muscle_group: MuscleGroup;
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  default_set_type: SetType;
  rest_seconds: number;
  target_text: string | null;
}

export interface TemplateDay {
  name: string;
  weekday: number | null;
  exercises: TemplateExercise[];
}

export interface RoutineTemplate {
  slug: string;
  name: string;
  inspired_by: string | null;
  description: string;
  days_per_week: number;
  level: TemplateLevel;
  goal: TemplateGoal;
  days: TemplateDay[];
}
```

- [ ] **Step 4: Add the labels** — `frontend/src/app/core/models/labels.ts`

Agregar `import type { TemplateGoal, TemplateLevel } from './routine-template';` junto a los demás imports, y al final del archivo:

```ts
export const TEMPLATE_LEVEL_LABELS: Record<TemplateLevel, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

export const TEMPLATE_GOAL_LABELS: Record<TemplateGoal, string> = {
  strength: 'Fuerza',
  hypertrophy: 'Hipertrofia',
  mixed: 'Fuerza e hipertrofia',
};
```

- [ ] **Step 5: Create the service** — `frontend/src/app/core/api/routine-templates-api.ts`

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Routine } from '../models/routine';
import type { RoutineTemplate } from '../models/routine-template';

@Injectable({ providedIn: 'root' })
export class RoutineTemplatesApi {
  private readonly http = inject(HttpClient);
  /** El catálogo no cambia durante la sesión: se pide una vez (y se reintenta si falló). */
  private catalog: Promise<RoutineTemplate[]> | null = null;

  list(): Promise<RoutineTemplate[]> {
    this.catalog ??= firstValueFrom(this.http.get<{ data: RoutineTemplate[] }>('/api/routine-templates'))
      .then((r) => r.data)
      .catch((error: unknown) => {
        this.catalog = null;
        throw error;
      });
    return this.catalog;
  }

  async find(slug: string): Promise<RoutineTemplate | undefined> {
    return (await this.list()).find((t) => t.slug === slug);
  }

  async import(slug: string): Promise<Routine> {
    const response = await firstValueFrom(
      this.http.post<{ data: Routine }>(`/api/routine-templates/${slug}/import`, {}),
    );
    return response.data;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include src/app/core/api/routine-templates-api.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/models/routine-template.ts frontend/src/app/core/models/labels.ts frontend/src/app/core/api/routine-templates-api.ts frontend/src/app/core/api/routine-templates-api.spec.ts
git commit -m "feat(templates): add routine template models, labels and API client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pantallas de catálogo y detalle

**Files:**
- Create: `frontend/src/app/features/routines/templates-page.ts`, `frontend/src/app/features/routines/template-detail-page.ts`
- Modify: `frontend/src/app/app.routes.ts` (hijos de `rutinas`), `frontend/src/app/features/routines/routines-page.ts` (botón), `frontend/src/app/features/routines/routine-detail-page.ts` (aviso)
- Test: `frontend/src/app/features/routines/templates-page.spec.ts`, `frontend/src/app/features/routines/template-detail-page.spec.ts`

**Interfaces:**
- Consumes: `RoutineTemplatesApi.list/find/import`, `TEMPLATE_LEVEL_LABELS`, `TEMPLATE_GOAL_LABELS` (Task 3); `formatTargets`, `formatRest` (`core/format/training.ts`); `SET_TYPE_LABELS` (`core/models/labels.ts`)
- Produces: rutas `/rutinas/plantillas` y `/rutinas/plantillas/:slug`; `/rutinas/:id?agregada=1` muestra el aviso

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/features/routines/templates-page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { RoutineTemplatesApi } from '../../core/api/routine-templates-api';
import type { RoutineTemplate } from '../../core/models/routine-template';
import { TemplatesPage } from './templates-page';

const nippard: RoutineTemplate = {
  slug: 'nippard-ppl', name: 'PPL estilo Jeff Nippard', inspired_by: 'Jeff Nippard',
  description: 'Push/pull/legs de 6 días.', days_per_week: 6, level: 'intermediate', goal: 'hypertrophy', days: [],
};

async function render(list: () => Promise<RoutineTemplate[]>) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: RoutineTemplatesApi, useValue: { list } }],
  });
  const fixture = TestBed.createComponent(TemplatesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('TemplatesPage', () => {
  it('shows each template with translated tags and who inspired it', async () => {
    const el = await render(() => Promise.resolve([nippard]));

    expect(el.textContent).toContain('PPL estilo Jeff Nippard');
    expect(el.textContent).toContain('Inspirada en Jeff Nippard');
    expect(el.textContent).toContain('6 días');
    expect(el.textContent).toContain('Intermedio');
    expect(el.textContent).toContain('Hipertrofia');
    expect(el.querySelector('a[href="/rutinas/plantillas/nippard-ppl"]')).not.toBeNull();
  });

  it('offers a retry when the catalog fails to load', async () => {
    const el = await render(() => Promise.reject(new Error('offline')));

    expect(el.textContent).toContain('No se pudo cargar el catálogo. Revisa tu conexión.');
    expect(el.querySelector('button')?.textContent).toContain('Reintentar');
  });
});
```

`frontend/src/app/features/routines/template-detail-page.spec.ts`:

```ts
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { RoutineTemplatesApi } from '../../core/api/routine-templates-api';
import type { RoutineTemplate } from '../../core/models/routine-template';
import { TemplateDetailPage } from './template-detail-page';

const phul: RoutineTemplate = {
  slug: 'phul', name: 'PHUL', inspired_by: null, description: 'Fuerza e hipertrofia.',
  days_per_week: 1, level: 'intermediate', goal: 'mixed',
  days: [{
    name: 'Lunes – Superior potencia', weekday: 1,
    exercises: [{
      name: 'Press de banca', muscle_group: 'chest', target_sets: 4, target_reps_min: 3, target_reps_max: 5,
      default_set_type: 'heavy', rest_seconds: 180, target_text: '3-4 series',
    }],
  }],
};

@Component({ template: '' })
class Blank {}

async function render(importFn: (slug: string) => Promise<unknown>) {
  const api = { find: vi.fn().mockResolvedValue(phul), import: vi.fn(importFn) };
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'rutinas/:id', component: Blank }]), { provide: RoutineTemplatesApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(TemplateDetailPage);
  fixture.componentRef.setInput('slug', 'phul');
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Agregar a mis rutinas'))!;
  return { fixture, api, el, button };
}

describe('TemplateDetailPage', () => {
  it('shows every day with its exercises and targets', async () => {
    const { el } = await render(() => Promise.resolve({ id: 42 }));

    expect(el.textContent).toContain('Lunes – Superior potencia');
    expect(el.textContent).toContain('Press de banca');
    expect(el.textContent).toContain('4 × 3-5');
    expect(el.textContent).toContain('Pesada');
    expect(el.textContent).toContain('3-4 series');
  });

  it('imports the template and opens the new routine', async () => {
    const { fixture, api, button } = await render(() => Promise.resolve({ id: 42 }));

    button().click();
    await fixture.whenStable();

    expect(api.import).toHaveBeenCalledWith('phul');
    expect(TestBed.inject(Router).url).toBe('/rutinas/42?agregada=1');
  });

  it('shows an error and re-enables the button when the import fails', async () => {
    const { fixture, el, button } = await render(() => Promise.reject(new Error('offline')));

    button().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('No se pudo agregar la plantilla. Revisa tu conexión e inténtalo de nuevo.');
    expect(button().disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include 'src/app/features/routines/template*.spec.ts'`
Expected: FAIL, no se resuelven `./templates-page` ni `./template-detail-page`.

- [ ] **Step 3: Create `frontend/src/app/features/routines/templates-page.ts`**

```ts
import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { RoutineTemplatesApi } from '../../core/api/routine-templates-api';
import { TEMPLATE_GOAL_LABELS, TEMPLATE_LEVEL_LABELS } from '../../core/models/labels';

@Component({
  selector: 'app-templates-page',
  imports: [RouterLink, HlmBadge, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/rutinas" class="mb-4 inline-block text-sm text-muted-foreground">← Rutinas</a>
    <h1 class="mb-1 page-title">Plantillas</h1>
    <p class="mb-6 text-sm text-muted-foreground">Rutinas de programas y atletas conocidos. Agrégalas a tus rutinas y actívalas cuando quieras.</p>

    @if (templates.value(); as list) {
      <ul class="flex flex-col gap-3">
        @for (t of list; track t.slug) {
          <li>
            <a [routerLink]="['/rutinas/plantillas', t.slug]" class="card block p-4">
              <span class="block text-lg font-semibold">{{ t.name }}</span>
              @if (t.inspired_by) {
                <span class="block text-sm text-muted-foreground">Inspirada en {{ t.inspired_by }}</span>
              }
              <span class="mt-2 flex flex-wrap gap-2">
                <span hlmBadge variant="outline">{{ t.days_per_week }} días</span>
                <span hlmBadge variant="outline">{{ levelLabels[t.level] }}</span>
                <span hlmBadge variant="outline">{{ goalLabels[t.goal] }}</span>
              </span>
              <span class="mt-2 line-clamp-2 block text-sm text-muted-foreground">{{ t.description }}</span>
            </a>
          </li>
        }
      </ul>
    } @else if (templates.error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">No se pudo cargar el catálogo. Revisa tu conexión.</p>
      <button hlmBtn variant="outline" class="h-12 w-full" (click)="templates.reload()">Reintentar</button>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class TemplatesPage {
  private readonly api = inject(RoutineTemplatesApi);

  protected readonly levelLabels = TEMPLATE_LEVEL_LABELS;
  protected readonly goalLabels = TEMPLATE_GOAL_LABELS;
  protected readonly templates = resource({ loader: () => this.api.list() });
}
```

- [ ] **Step 4: Create `frontend/src/app/features/routines/template-detail-page.ts`**

```ts
import { ChangeDetectionStrategy, Component, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { RoutineTemplatesApi } from '../../core/api/routine-templates-api';
import { formatRest, formatTargets } from '../../core/format/training';
import { SET_TYPE_LABELS, TEMPLATE_GOAL_LABELS, TEMPLATE_LEVEL_LABELS } from '../../core/models/labels';

@Component({
  selector: 'app-template-detail-page',
  imports: [RouterLink, HlmBadge, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/rutinas/plantillas" class="mb-4 inline-block text-sm text-muted-foreground">← Plantillas</a>

    @if (template.value(); as t) {
      <h1 class="mb-1 page-title">{{ t.name }}</h1>
      @if (t.inspired_by) { <p class="text-sm text-muted-foreground">Inspirada en {{ t.inspired_by }}</p> }
      <p class="mt-2 flex flex-wrap gap-2">
        <span hlmBadge variant="outline">{{ t.days_per_week }} días</span>
        <span hlmBadge variant="outline">{{ levelLabels[t.level] }}</span>
        <span hlmBadge variant="outline">{{ goalLabels[t.goal] }}</span>
      </p>
      <p class="mt-3 mb-6 text-muted-foreground">{{ t.description }}</p>

      @for (day of t.days; track $index) {
        <section class="mb-4">
          <h2 class="mb-2 section-title">{{ day.name }}</h2>
          <ul class="flex flex-col gap-2">
            @for (e of day.exercises; track $index) {
              <li class="card p-3">
                <span class="block font-medium">{{ e.name }}</span>
                <span class="text-sm text-muted-foreground">
                  {{ formatTargets(e) }} · {{ setTypeLabels[e.default_set_type] }} · {{ formatRest(e.rest_seconds) }}
                </span>
                @if (e.target_text) { <span class="block text-sm text-muted-foreground">{{ e.target_text }}</span> }
              </li>
            }
          </ul>
        </section>
      }

      <div class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-6 bg-background/90 py-2 backdrop-blur">
        @if (error()) { <p class="mb-2 text-sm text-destructive" role="alert">{{ error() }}</p> }
        <button hlmBtn class="h-12 w-full" [disabled]="importing()" (click)="importTemplate(t.slug)">
          {{ importing() ? 'Agregando…' : 'Agregar a mis rutinas' }}
        </button>
      </div>
    } @else if (template.isLoading()) {
      <p class="text-muted-foreground">Cargando…</p>
    } @else if (template.error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">No se pudo cargar el catálogo. Revisa tu conexión.</p>
      <button hlmBtn variant="outline" class="h-12 w-full" (click)="template.reload()">Reintentar</button>
    } @else {
      <p class="text-muted-foreground">Esta plantilla no existe.</p>
    }
  `,
})
export class TemplateDetailPage {
  private readonly api = inject(RoutineTemplatesApi);
  private readonly router = inject(Router);

  readonly slug = input.required<string>();

  protected readonly levelLabels = TEMPLATE_LEVEL_LABELS;
  protected readonly goalLabels = TEMPLATE_GOAL_LABELS;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly formatTargets = formatTargets;
  protected readonly formatRest = formatRest;

  protected readonly template = resource({ params: () => this.slug(), loader: ({ params }) => this.api.find(params) });
  protected readonly importing = signal(false);
  protected readonly error = signal<string | null>(null);

  async importTemplate(slug: string): Promise<void> {
    this.importing.set(true);
    this.error.set(null);
    try {
      const routine = await this.api.import(slug);
      await this.router.navigate(['/rutinas', routine.id], { queryParams: { agregada: 1 } });
    } catch {
      this.error.set('No se pudo agregar la plantilla. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.importing.set(false);
    }
  }
}
```

- [ ] **Step 5: Run the page tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include 'src/app/features/routines/template*.spec.ts'`
Expected: PASS (5 tests).

- [ ] **Step 6: Wire routes, entry button and notice**

En `frontend/src/app/app.routes.ts`, dentro de los `children` de `rutinas`, **antes** de `{ path: ':id', ... }`:

```ts
          { path: 'plantillas', title: 'Plantillas · GymTracker', loadComponent: () => import('./features/routines/templates-page').then((m) => m.TemplatesPage) },
          { path: 'plantillas/:slug', title: 'Plantilla · GymTracker', loadComponent: () => import('./features/routines/template-detail-page').then((m) => m.TemplateDetailPage) },
```

En `frontend/src/app/features/routines/routines-page.ts`, justo después del `</form>` de "Crear" (`RouterLink` y `HlmButton` ya están en `imports`):

```html
    <a hlmBtn variant="outline" routerLink="/rutinas/plantillas" class="mb-6 flex h-12 w-full items-center justify-center">Explorar plantillas</a>
```

En `frontend/src/app/features/routines/routine-detail-page.ts`:
- agregar el input `readonly agregada = input<string>();`. El query param `?agregada=1` llega por `withComponentInputBinding`, igual que `id`. Agregar `input` al import de `@angular/core` si falta;
- en el template, justo después del enlace `← Rutinas`:

```html
    @if (agregada()) {
      <p class="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm" role="status">
        Rutina agregada. Actívala cuando quieras empezarla.
      </p>
    }
```

- [ ] **Step 7: Run the full frontend suite and build**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: todos los tests en verde y el build sin errores.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/routines frontend/src/app/app.routes.ts
git commit -m "feat(templates): browse routine templates and add them to your routines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Revisión de Luciano e integración

- [ ] **Step 1: Run everything**

Run: `cd backend && ./vendor/bin/pest && cd ../frontend && npx ng test --watch=false`
Expected: las dos suites en verde.

- [ ] **Step 2: Local check (Luciano)**

`docker compose up -d` y `cd frontend && npm start`. Entrar con `luciano@gymtracker.test` / `password` y revisar:
1. Rutinas → "Explorar plantillas": aparecen las 7 tarjetas con sus etiquetas.
2. Abrir "PPL estilo Jeff Nippard": se ven los 6 días con sus ejercicios.
3. "Agregar a mis rutinas": abre la rutina nueva con el aviso, **sin** la etiqueta "Activa".
4. Volver a Rutinas: la rutina anterior sigue activa. Activar la nueva y luego volver a activar la anterior.
5. En Ejercicios no hay duplicados de "Press de banca".

- [ ] **Step 3: Merge (solo cuando Luciano diga "intégralo a main")**

```bash
git push . HEAD:main && git checkout main && git push origin main
gh run watch --exit-status $(gh run list --branch main --workflow Deploy --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: el Deploy queda en verde y las plantillas aparecen en producción.
