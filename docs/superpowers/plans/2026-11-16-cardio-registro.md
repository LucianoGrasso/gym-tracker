# Cardio (plan 1: datos, registro, rutinas y formulario) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder crear ejercicios de cardio, planificarlos en rutinas y registrar tramos (duración, velocidad, inclinación, distancia, FC, calorías) en la sesión, sin que el cardio entre en las estadísticas de fuerza.

**Architecture:** `exercises.kind` (`strength` | `cardio`) separa los dos mundos. Un tramo de cardio es una fila de `workout_sets` con seis columnas nuevas nullable (peso y reps en 0), así se reusan el ULID, la cola offline y la sincronización. En el frontend, una tarjeta propia (`CardioCard`) con funciones puras en `core/workout/cardio.ts`; la tarjeta de fuerza no cambia. `StatsDataLoader::sets()` filtra `kind = strength`.

**Tech Stack:** Laravel 13 + Pest (backend), Angular 22 standalone/zoneless + Signals + Vitest (frontend).

Spec: `docs/superpowers/specs/2026-11-16-cardio-design.md` (secciones 1, 2, 3 y 5, más el filtro de la sección 4). El plan 2 (estadísticas de cardio) va aparte. **No integrar a `main` hasta terminar el plan 2.**

## Global Constraints

- Rama `cardio`. Código, tablas y variables en inglés; textos de UI en español (Chile), decimales con coma (`formatNumber` de `set-suggestions.ts`).
- Enums como string en inglés en `App\Enums`.
- Validación en Form Requests. Nada de lógica de estadísticas en controladores.
- Campos de tramo y validación: `duration_seconds` 1–86400 (obligatorio en cardio) · `speed_kmh` 0–60 · `incline_pct` 0–40 · `distance_km` 0–999,99 · `avg_heart_rate` 30–250 · `calories` 0–9999.
- En cardio: `weight_kg = 0`, `reps = 0`, `set_type = normal`, `side = both`.
- Ejercicio de cardio: `muscle_group = other`, `secondary_muscles = []`, `is_unilateral = false`, `uses_bodyweight = false`.
- En el frontend `kind` es opcional en los tipos (`kind?: ExerciseKind`): sesiones y ejercicios guardados en el dispositivo antes de este cambio no lo tienen; ausente = fuerza. Igual con los campos de cardio de `WorkoutSet`.
- Comandos: backend `cd backend && ./vendor/bin/pest`; frontend `cd frontend && npx ng test --watch=false`. Pint: `cd backend && ./vendor/bin/pint`.

---

### Task 1: Tipo de ejercicio en el backend

**Files:**
- Create: `backend/app/Enums/ExerciseKind.php`
- Create: `backend/database/migrations/2026_11_16_000001_add_kind_to_exercises_table.php`
- Modify: `backend/app/Models/Exercise.php`
- Modify: `backend/app/Http/Resources/ExerciseResource.php`
- Modify: `backend/app/Http/Requests/ExerciseRequest.php`
- Test: `backend/tests/Feature/Api/ExercisesTest.php`

**Interfaces:**
- Produces: `App\Enums\ExerciseKind` (`Strength = 'strength'`, `Cardio = 'cardio'`); `Exercise::$kind` casteado al enum, default `strength`; JSON de ejercicio con `kind`.

- [ ] **Step 1: Write the failing tests** (al final de `ExercisesTest.php`)

```php
it('creates a cardio exercise without muscles', function () {
    $this->postJson('/api/exercises', exercisePayload([
        'name' => 'Caminata inclinada', 'kind' => 'cardio', 'equipment' => 'machine',
        'muscle_group' => 'quads', 'secondary_muscles' => ['calves'], 'is_unilateral' => true, 'uses_bodyweight' => true,
    ]))
        ->assertCreated()
        ->assertJsonPath('data.kind', 'cardio')
        ->assertJsonPath('data.muscle_group', 'other')
        ->assertJsonPath('data.secondary_muscles', [])
        ->assertJsonPath('data.is_unilateral', false)
        ->assertJsonPath('data.uses_bodyweight', false);
});

it('defaults to a strength exercise', function () {
    $this->postJson('/api/exercises', exercisePayload())
        ->assertCreated()
        ->assertJsonPath('data.kind', 'strength');
});

it('refuses to change the kind of an exercise with history', function () {
    $exercise = Exercise::factory()->for($this->user)->create();
    WorkoutExercise::factory()->create(['exercise_id' => $exercise->id]);

    $this->putJson("/api/exercises/{$exercise->id}", exercisePayload(['kind' => 'cardio']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['kind' => 'no puedes cambiar su tipo']);
});

it('changes the kind of an exercise without history', function () {
    $exercise = Exercise::factory()->for($this->user)->create();

    $this->putJson("/api/exercises/{$exercise->id}", exercisePayload(['kind' => 'cardio']))
        ->assertOk()
        ->assertJsonPath('data.kind', 'cardio');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && ./vendor/bin/pest --filter=ExercisesTest`
Expected: FAIL (`data.kind` no existe).

- [ ] **Step 3: Implement**

`backend/app/Enums/ExerciseKind.php`:

```php
<?php

namespace App\Enums;

enum ExerciseKind: string
{
    case Strength = 'strength';
    case Cardio = 'cardio';
}
```

Migración:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->string('kind', 10)->default('strength')->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn('kind');
        });
    }
};
```

`Exercise.php`: agregar `'kind'` a `$fillable` (después de `'name'`), `'kind' => ExerciseKind::class` a `casts()`, `use App\Enums\ExerciseKind;` y, para que un modelo recién creado sin `kind` no devuelva `null` en el JSON:

```php
    /** @var array<string, mixed> */
    protected $attributes = ['kind' => 'strength'];
```

`ExerciseResource.php`: `'kind' => $this->kind,` después de `'name'`.

`ExerciseRequest.php`:

```php
use App\Enums\ExerciseKind;
use App\Models\Exercise;
use Illuminate\Validation\Validator;

    /** Un ejercicio de cardio no trabaja músculos en las estadísticas: se guardan valores neutros. */
    protected function prepareForValidation(): void
    {
        if ($this->input('kind') === ExerciseKind::Cardio->value) {
            $this->merge([
                'muscle_group' => 'other',
                'secondary_muscles' => [],
                'is_unilateral' => false,
                'uses_bodyweight' => false,
            ]);
        }
    }
```

En `rules()`, agregar: `'kind' => ['sometimes', Rule::enum(ExerciseKind::class)],`

Y la regla de historial:

```php
    public function after(): array
    {
        return [function (Validator $validator) {
            $exercise = $this->route('exercise');
            if (
                $exercise instanceof Exercise
                && $this->has('kind')
                && $this->input('kind') !== $exercise->kind->value
                && $exercise->workoutExercises()->exists()
            ) {
                $validator->errors()->add('kind', 'El ejercicio tiene historial: no puedes cambiar su tipo.');
            }
        }];
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest --filter=ExercisesTest`
Expected: PASS. Luego `./vendor/bin/pest` completo: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Enums/ExerciseKind.php backend/database/migrations/2026_11_16_000001_add_kind_to_exercises_table.php backend/app/Models/Exercise.php backend/app/Http/Resources/ExerciseResource.php backend/app/Http/Requests/ExerciseRequest.php backend/tests/Feature/Api/ExercisesTest.php
git commit -m "feat(exercises): strength or cardio kind"
```

---

### Task 2: Cardio en la biblioteca

**Files:**
- Modify: `backend/app/Support/ExerciseCatalog.php`
- Test: `backend/tests/Unit/ExerciseCatalogTest.php`, `backend/tests/Feature/Api/ExerciseLibraryTest.php`

**Interfaces:**
- Consumes: `ExerciseKind` (Task 1).
- Produces: `ExerciseCatalog::get()` y `all()` incluyen `'kind' => ExerciseKind`; 155 ejercicios (147 + 8 de cardio, al final de la lista).

- [ ] **Step 1: Write the failing tests**

En `ExerciseCatalogTest.php`, cambiar el primer test a 155 (las tres veces) y agregar:

```php
use App\Enums\Equipment;
use App\Enums\ExerciseKind;

it('includes eight cardio exercises without muscles', function () {
    $cardio = array_values(array_filter(ExerciseCatalog::all(), fn (array $e) => $e['kind'] === ExerciseKind::Cardio));

    expect(array_column($cardio, 'name'))->toBe([
        'Caminata inclinada en trotadora', 'Trote en trotadora', 'Bicicleta estática', 'Elíptica',
        'Remoergómetro', 'Escaladora', 'Caminata al aire libre', 'Trote al aire libre',
    ]);
    foreach ($cardio as $exercise) {
        expect($exercise)->toMatchArray([
            'muscle_group' => MuscleGroup::Other, 'secondary_muscles' => [], 'is_unilateral' => false, 'uses_bodyweight' => false,
        ]);
    }
    expect(ExerciseCatalog::get('Trote al aire libre')['equipment'])->toBe(Equipment::Bodyweight)
        ->and(ExerciseCatalog::get('Elíptica')['equipment'])->toBe(Equipment::Machine)
        ->and(ExerciseCatalog::get('Press de banca')['kind'])->toBe(ExerciseKind::Strength);
});
```

En `ExerciseLibraryTest.php`:

```php
it('adopts a cardio exercise with its kind', function () {
    $this->postJson('/api/exercises/from-library', ['slug' => 'caminata-inclinada-en-trotadora'])
        ->assertCreated()
        ->assertJsonPath('data.kind', 'cardio')
        ->assertJsonPath('data.muscle_group', 'other');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && ./vendor/bin/pest --filter="ExerciseCatalogTest|ExerciseLibraryTest"`
Expected: FAIL (cuenta 147, sin `kind`).

- [ ] **Step 3: Implement**

En `ExerciseCatalog.php`, después de `EXERCISES`:

```php
    /** Cardio: name => equipo. Sin músculos (no cuentan en las estadísticas de fuerza). */
    private const CARDIO = [
        'Caminata inclinada en trotadora' => Equipment::Machine,
        'Trote en trotadora' => Equipment::Machine,
        'Bicicleta estática' => Equipment::Machine,
        'Elíptica' => Equipment::Machine,
        'Remoergómetro' => Equipment::Machine,
        'Escaladora' => Equipment::Machine,
        'Caminata al aire libre' => Equipment::Bodyweight,
        'Trote al aire libre' => Equipment::Bodyweight,
    ];
```

`has()`: `return array_key_exists($name, self::EXERCISES) || array_key_exists($name, self::CARDIO);`

`get()`:

```php
    /**
     * @return array{kind: ExerciseKind, muscle_group: MuscleGroup, secondary_muscles: list<MuscleGroup>, equipment: Equipment, is_unilateral: bool, uses_bodyweight: bool}
     */
    public static function get(string $name): array
    {
        if (! self::has($name)) {
            throw new InvalidArgumentException("Ejercicio desconocido en el catálogo: {$name}");
        }
        if (array_key_exists($name, self::CARDIO)) {
            return [
                'kind' => ExerciseKind::Cardio,
                'muscle_group' => MuscleGroup::Other,
                'secondary_muscles' => [],
                'equipment' => self::CARDIO[$name],
                'is_unilateral' => false,
                'uses_bodyweight' => false,
            ];
        }
        [$muscle, $secondary, $equipment, $unilateral, $bodyweight] = self::EXERCISES[$name];

        return [
            'kind' => ExerciseKind::Strength,
            'muscle_group' => $muscle,
            'secondary_muscles' => $secondary,
            'equipment' => $equipment,
            'is_unilateral' => $unilateral,
            'uses_bodyweight' => $bodyweight,
        ];
    }
```

`all()`: iterar `[...array_keys(self::EXERCISES), ...array_keys(self::CARDIO)]`. Actualizar los `@return` de `all()` y `findBySlug()` con `kind: ExerciseKind`. Agregar `use App\Enums\ExerciseKind;`.

`LibraryExerciseResolver` y `GymTrackerSeeder` usan `ExerciseCatalog::get()` con `Exercise::create(... + get())`: ya reciben `kind` sin cambios.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS (si algún test de plantillas o de la demo contaba 147, actualizarlo a 155).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Support/ExerciseCatalog.php backend/tests/Unit/ExerciseCatalogTest.php backend/tests/Feature/Api/ExerciseLibraryTest.php
git commit -m "feat(library): eight cardio exercises"
```

---

### Task 3: Tramos de cardio en `workout_sets`

**Files:**
- Create: `backend/database/migrations/2026_11_16_000002_add_cardio_fields_to_workout_sets_table.php`
- Modify: `backend/app/Models/WorkoutSet.php`
- Modify: `backend/app/Http/Resources/WorkoutSetResource.php`
- Modify: `backend/app/Http/Requests/WorkoutSetRequest.php`
- Test: `backend/tests/Feature/Api/WorkoutSetsTest.php`

**Interfaces:**
- Consumes: `ExerciseKind` (Task 1).
- Produces: JSON de serie con `duration_seconds:int|null`, `speed_kmh:float|null`, `incline_pct:float|null`, `distance_km:float|null`, `avg_heart_rate:int|null`, `calories:int|null`.

- [ ] **Step 1: Write the failing tests**

```php
use App\Enums\ExerciseKind;
use App\Models\Exercise;

function cardioItem(User $user): WorkoutExercise
{
    return WorkoutExercise::factory()->create([
        'workout_id' => Workout::factory()->for($user)->create()->id,
        'exercise_id' => Exercise::factory()->for($user)->create(['kind' => ExerciseKind::Cardio])->id,
    ]);
}

function segmentPayload(array $overrides = []): array
{
    return array_merge([
        'set_number' => 1, 'set_type' => 'normal', 'weight_kg' => 0, 'reps' => 0, 'side' => 'both',
        'duration_seconds' => 2100, 'speed_kmh' => 5.5, 'incline_pct' => 12, 'distance_km' => 3.2,
        'avg_heart_rate' => 128, 'calories' => 250,
    ], $overrides);
}

it('stores a cardio segment', function () {
    $item = cardioItem($this->user);
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", segmentPayload(['workout_exercise_id' => $item->id]))
        ->assertCreated()
        ->assertJsonPath('data.duration_seconds', 2100)
        ->assertJsonPath('data.speed_kmh', 5.5)
        ->assertJsonPath('data.incline_pct', 12.0)
        ->assertJsonPath('data.distance_km', 3.2)
        ->assertJsonPath('data.avg_heart_rate', 128)
        ->assertJsonPath('data.calories', 250);
});

it('requires the duration of a cardio segment', function () {
    $item = cardioItem($this->user);
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", segmentPayload(['workout_exercise_id' => $item->id, 'duration_seconds' => null]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['duration_seconds' => 'La duración es obligatoria.']);
});

it('validates the cardio ranges', function () {
    $item = cardioItem($this->user);
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", segmentPayload([
        'workout_exercise_id' => $item->id, 'duration_seconds' => 0, 'speed_kmh' => 61, 'incline_pct' => 41,
        'distance_km' => 1000, 'avg_heart_rate' => 29, 'calories' => 10000,
    ]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['duration_seconds', 'speed_kmh', 'incline_pct', 'distance_km', 'avg_heart_rate', 'calories']);
});

it('keeps strength sets without cardio fields', function () {
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", setPayload(['workout_exercise_id' => $this->item->id]))
        ->assertCreated()
        ->assertJsonPath('data.duration_seconds', null)
        ->assertJsonPath('data.speed_kmh', null);
});
```

Si `$this->item` (creado en `beforeEach`) llegara a tener un ejercicio de cardio, no pasa: la factory no fija `kind` y el default es `strength`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && ./vendor/bin/pest --filter=WorkoutSetsTest`
Expected: FAIL.

- [ ] **Step 3: Implement**

Migración:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workout_sets', function (Blueprint $table) {
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->decimal('speed_kmh', 4, 1)->nullable();
            $table->decimal('incline_pct', 3, 1)->nullable();
            $table->decimal('distance_km', 6, 2)->nullable();
            $table->unsignedSmallInteger('avg_heart_rate')->nullable();
            $table->unsignedSmallInteger('calories')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('workout_sets', function (Blueprint $table) {
            $table->dropColumn(['duration_seconds', 'speed_kmh', 'incline_pct', 'distance_km', 'avg_heart_rate', 'calories']);
        });
    }
};
```

`WorkoutSet.php`: sumar a `$fillable` `'duration_seconds', 'speed_kmh', 'incline_pct', 'distance_km', 'avg_heart_rate', 'calories'` y a `casts()`:

```php
            'duration_seconds' => 'integer',
            'speed_kmh' => 'float',
            'incline_pct' => 'float',
            'distance_km' => 'float',
            'avg_heart_rate' => 'integer',
            'calories' => 'integer',
```

`WorkoutSetResource.php`, después de `'notes'`:

```php
            'duration_seconds' => $this->duration_seconds,
            'speed_kmh' => $this->speed_kmh,
            'incline_pct' => $this->incline_pct,
            'distance_km' => $this->distance_km,
            'avg_heart_rate' => $this->avg_heart_rate,
            'calories' => $this->calories,
```

`WorkoutSetRequest.php`, en `rules()`:

```php
            'duration_seconds' => [Rule::requiredIf(fn () => $this->isCardio()), 'nullable', 'integer', 'between:1,86400'],
            'speed_kmh' => ['nullable', 'numeric', 'between:0,60'],
            'incline_pct' => ['nullable', 'numeric', 'between:0,40'],
            'distance_km' => ['nullable', 'numeric', 'between:0,999.99'],
            'avg_heart_rate' => ['nullable', 'integer', 'between:30,250'],
            'calories' => ['nullable', 'integer', 'between:0,9999'],
```

Y:

```php
use App\Enums\ExerciseKind;
use App\Models\WorkoutExercise;

    public function messages(): array
    {
        return ['duration_seconds.required' => 'La duración es obligatoria.'];
    }

    private function isCardio(): bool
    {
        return WorkoutExercise::query()
            ->whereKey($this->input('workout_exercise_id'))
            ->whereHas('exercise', fn ($query) => $query->where('kind', ExerciseKind::Cardio->value))
            ->exists();
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/database/migrations/2026_11_16_000002_add_cardio_fields_to_workout_sets_table.php backend/app/Models/WorkoutSet.php backend/app/Http/Resources/WorkoutSetResource.php backend/app/Http/Requests/WorkoutSetRequest.php backend/tests/Feature/Api/WorkoutSetsTest.php
git commit -m "feat(workouts): cardio segments in workout sets"
```

---

### Task 4: Las estadísticas de fuerza ignoran el cardio

**Files:**
- Modify: `backend/app/Services/Stats/StatsDataLoader.php`
- Test: `backend/tests/Feature/Api/StatsDataLoaderTest.php`

**Interfaces:**
- Produces: `StatsDataLoader::sets()` solo devuelve series de ejercicios `kind = strength`. Nada más cambia.

- [ ] **Step 1: Write the failing test**

```php
use App\Enums\ExerciseKind;

it('leaves cardio out of the strength sets', function () {
    $bench = Exercise::factory()->for($this->user)->create(['name' => 'Press de banca']);
    $walk = Exercise::factory()->for($this->user)->create(['name' => 'Caminata', 'kind' => ExerciseKind::Cardio, 'muscle_group' => MuscleGroup::Other]);
    loggedWorkout($this->user, $bench, '2026-11-10', [[60, 8, SetType::Normal]]);
    loggedWorkout($this->user, $walk, '2026-11-12', [[0, 0, SetType::Normal]]);

    $sets = app(StatsDataLoader::class)->sets();

    expect($sets)->toHaveCount(1)
        ->and($sets->first()->exerciseName)->toBe('Press de banca');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && ./vendor/bin/pest --filter=StatsDataLoaderTest`
Expected: FAIL (2 series).

- [ ] **Step 3: Implement**

En `sets()`, después de `->where('w.user_id', auth()->id())`:

```php
            ->where('e.kind', ExerciseKind::Strength->value)
```

con `use App\Enums\ExerciseKind;`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Stats/StatsDataLoader.php backend/tests/Feature/Api/StatsDataLoaderTest.php
git commit -m "feat(stats): strength stats skip cardio exercises"
```

---

### Task 5: Modelos del frontend y funciones de cardio

**Files:**
- Modify: `frontend/src/app/core/models/exercise.ts`
- Modify: `frontend/src/app/core/models/workout.ts`
- Modify: `frontend/src/app/core/models/library.ts`
- Modify: `frontend/src/app/core/models/labels.ts`
- Modify: `frontend/src/app/core/workout/session-mapping.ts`
- Modify: `frontend/src/app/core/workout/set-suggestions.ts`
- Create: `frontend/src/app/core/workout/cardio.ts`
- Test: `frontend/src/app/core/workout/cardio.spec.ts`, `frontend/src/app/core/workout/set-suggestions.spec.ts`, `frontend/src/app/core/workout/session-mapping.spec.ts`

**Interfaces:**
- Produces:
  - `type ExerciseKind = 'strength' | 'cardio'`; `Exercise.kind?: ExerciseKind`; `ExerciseInput` incluye `kind: ExerciseKind`; `ExerciseRef` incluye `kind?`; `LibraryExercise.kind?`.
  - `WorkoutSet` suma opcionales `duration_seconds?`, `speed_kmh?`, `incline_pct?`, `distance_km?`, `avg_heart_rate?`, `calories?` (todos `number | null`).
  - `isCardio(exercise: { kind?: ExerciseKind }): boolean` (en `cardio.ts`).
  - `categoryLabel(exercise: { kind?: ExerciseKind; muscle_group: MuscleGroup }): string` (en `labels.ts`): `'Cardio'` o la etiqueta del músculo.
  - En `cardio.ts`: `suggestNextSegment(item: SessionExercise): WorkoutSetInput`, `stepMinutes(seconds: number, deltaMinutes: number): number`, `stepHalf(value: number | null, delta: number): number`, `formatDuration(seconds: number): string`, `formatSegmentLine(set: WorkoutSet): string`, `formatCardioTotal(sets: WorkoutSet[]): string`, `formatSegments(n: number): string`, `DEFAULT_SEGMENT_SECONDS = 1800`.
  - `isPending` considera hecho un ejercicio de cardio con al menos un tramo.

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/core/workout/cardio.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from '../models/exercise';
import type { SessionExercise } from '../models/workout';
import {
  formatCardioTotal, formatDuration, formatSegmentLine, formatSegments, isCardio, stepHalf, stepMinutes, suggestNextSegment,
} from './cardio';

const segment = (extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type: 'normal', weight_kg: 0, reps: 0, side: 'both',
  rir: null, pain_level: null, notes: null, duration_seconds: 2100, speed_kmh: 5.5, incline_pct: 12,
  distance_km: null, avg_heart_rate: null, calories: null, ...extra,
});

const walk = (overrides: Partial<SessionExercise> = {}): SessionExercise => ({
  id: 'we', exercise: { id: 1, name: 'Caminata inclinada', uses_bodyweight: false, is_unilateral: false, kind: 'cardio' },
  position: 0, target_sets: 1, target_reps_min: null, target_reps_max: null, target_text: '35 min · 12 %',
  default_set_type: 'normal', rest_seconds: 0, notes: null, last_performance: null, sets: [], ...overrides,
});

const blank = { weight_kg: 0, reps: 0, set_type: 'normal', side: 'both', rir: null, pain_level: null, notes: null };

describe('isCardio', () => {
  it('treats a missing kind as strength', () => {
    expect(isCardio({ kind: 'cardio' })).toBe(true);
    expect(isCardio({ kind: 'strength' })).toBe(false);
    expect(isCardio({})).toBe(false);
  });
});

describe('suggestNextSegment', () => {
  it('copies duration, speed and incline of the previous segment today', () => {
    const s = suggestNextSegment(walk({ sets: [segment({ duration_seconds: 300, speed_kmh: 8, incline_pct: 1, distance_km: 0.7, avg_heart_rate: 150 })] }));
    expect(s).toEqual({ ...blank, duration_seconds: 300, speed_kmh: 8, incline_pct: 1, distance_km: null, avg_heart_rate: null, calories: null });
  });
  it('uses the first segment of last time', () => {
    const s = suggestNextSegment(walk({ last_performance: { workout_id: 'w', date: '2026-11-12', sets: [segment(), segment({ speed_kmh: 6 })] } }));
    expect(s).toMatchObject({ duration_seconds: 2100, speed_kmh: 5.5, incline_pct: 12 });
  });
  it('starts at 30 minutes without history', () => {
    expect(suggestNextSegment(walk())).toEqual({
      ...blank, duration_seconds: 1800, speed_kmh: null, incline_pct: null, distance_km: null, avg_heart_rate: null, calories: null,
    });
  });
});

describe('steppers', () => {
  it('steps minutes and never goes under one minute', () => {
    expect(stepMinutes(1800, 1)).toBe(1860);
    expect(stepMinutes(60, -1)).toBe(60);
  });
  it('steps by halves from empty and never below zero', () => {
    expect(stepHalf(null, 0.5)).toBe(0.5);
    expect(stepHalf(5.5, 0.5)).toBe(6);
    expect(stepHalf(0, -0.5)).toBe(0);
  });
});

describe('formatting', () => {
  it('formats durations in minutes', () => {
    expect(formatDuration(2100)).toBe('35 min');
    expect(formatDuration(2130)).toBe('35:30 min');
  });
  it('lists only the fields present', () => {
    expect(formatSegmentLine(segment())).toBe('35 min · 5,5 km/h · 12 %');
    expect(formatSegmentLine(segment({ speed_kmh: null, incline_pct: null, distance_km: 3.2, avg_heart_rate: 128, calories: 250 })))
      .toBe('35 min · 3,2 km · FC 128 · 250 kcal');
  });
  it('totals duration and distance', () => {
    expect(formatCardioTotal([segment({ duration_seconds: 600 }), segment({ duration_seconds: 300 })])).toBe('Total: 15 min');
    expect(formatCardioTotal([segment({ distance_km: 1.5 }), segment({ distance_km: 1.7 })])).toBe('Total: 70 min · 3,2 km');
  });
  it('names segments', () => {
    expect(formatSegments(1)).toBe('1 tramo');
    expect(formatSegments(3)).toBe('3 tramos');
  });
});
```

En `set-suggestions.spec.ts`, dentro de un `describe('isPending')` nuevo:

```ts
describe('isPending', () => {
  it('marks cardio as done after its first segment', () => {
    const cardio = exercise({ target_sets: 3, exercise: { id: 2, name: 'Trote', uses_bodyweight: false, is_unilateral: false, kind: 'cardio' } });
    expect(isPending(cardio)).toBe(true);
    expect(isPending({ ...cardio, sets: [set(0, 0)] })).toBe(false);
  });
});
```

(Si ya existe un `describe('isPending')`, agrega el `it` ahí.)

En `session-mapping.spec.ts`, agregar `sessionExerciseFrom` al import de `./session-mapping`, `import type { Exercise } from '../models/exercise';` y:

```ts
it('keeps the exercise kind in the session', () => {
  const walk: Exercise = {
    id: 7, name: 'Trote', kind: 'cardio', muscle_group: 'other', secondary_muscles: [], equipment: 'machine',
    is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
  };
  expect(sessionExerciseFrom(walk, 'we', 0, null).exercise.kind).toBe('cardio');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (`./cardio` no existe; `kind` no está en los tipos).

- [ ] **Step 3: Implement**

`core/models/exercise.ts`:

```ts
export type ExerciseKind = 'strength' | 'cardio';
```

En `Exercise`, después de `name`: `/** Ausente en ejercicios guardados en el dispositivo antes del 2026-11-16: es fuerza. */ kind?: ExerciseKind;`

`ExerciseInput`:

```ts
export type ExerciseInput = Pick<
  Exercise,
  'name' | 'muscle_group' | 'secondary_muscles' | 'equipment' | 'is_unilateral' | 'uses_bodyweight' | 'notes'
> & { kind: ExerciseKind };
```

En `WorkoutSet`, después de `notes`:

```ts
  /** Tramos de cardio (ausentes en series guardadas antes del 2026-11-16). */
  duration_seconds?: number | null;
  speed_kmh?: number | null;
  incline_pct?: number | null;
  distance_km?: number | null;
  avg_heart_rate?: number | null;
  calories?: number | null;
```

`core/models/workout.ts`: `ExerciseRef = Pick<Exercise, 'id' | 'name' | 'uses_bodyweight' | 'is_unilateral' | 'kind'> & { equipment?: Equipment };`

`core/models/library.ts`: importar `ExerciseKind` y agregar `kind?: ExerciseKind;` después de `name`.

`core/models/labels.ts`, al final:

```ts
/** "Cardio" para ejercicios de cardio; si no, el músculo principal. */
export function categoryLabel(exercise: { kind?: ExerciseKind; muscle_group: MuscleGroup }): string {
  return exercise.kind === 'cardio' ? 'Cardio' : MUSCLE_GROUP_LABELS[exercise.muscle_group];
}
```

(con `ExerciseKind` en el `import type` de `./exercise`).

`core/workout/session-mapping.ts`, en `ref()`: agregar `kind: exercise.kind,`.

`core/workout/set-suggestions.ts`, `isPending`:

```ts
export function isPending(item: SessionExercise): boolean {
  if (item.exercise.kind === 'cardio') return item.sets.length === 0;
  const done = workingSets(item.sets).length;
  return item.target_sets === null ? done === 0 : done < item.target_sets;
}
```

`core/workout/cardio.ts`:

```ts
import type { ExerciseKind, WorkoutSet } from '../models/exercise';
import type { SessionExercise, WorkoutSetInput } from '../models/workout';
import { formatNumber } from './set-suggestions';

export const DEFAULT_SEGMENT_SECONDS = 1800;

export function isCardio(exercise: { kind?: ExerciseKind }): boolean {
  return exercise.kind === 'cardio';
}

/** Un tramo nuevo: peso y reps en 0; duración, velocidad e inclinación del tramo anterior o de la última vez. */
export function suggestNextSegment(item: SessionExercise): WorkoutSetInput {
  const reference = item.sets.at(-1) ?? item.last_performance?.sets[0];
  return {
    weight_kg: 0,
    reps: 0,
    set_type: 'normal',
    side: 'both',
    rir: null,
    pain_level: null,
    notes: null,
    duration_seconds: reference?.duration_seconds ?? DEFAULT_SEGMENT_SECONDS,
    speed_kmh: reference?.speed_kmh ?? null,
    incline_pct: reference?.incline_pct ?? null,
    distance_km: null,
    avg_heart_rate: null,
    calories: null,
  };
}

export function stepMinutes(seconds: number, deltaMinutes: number): number {
  return Math.max(60, seconds + deltaMinutes * 60);
}

/** Velocidad e inclinación de 0,5 en 0,5; desde vacío parte en 0. */
export function stepHalf(value: number | null, delta: number): number {
  return Math.max(0, Math.round(((value ?? 0) + delta) * 10) / 10);
}

/** 2100 → "35 min"; 2130 → "35:30 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes}:${String(rest).padStart(2, '0')} min`;
}

export function formatSegmentLine(set: WorkoutSet): string {
  const parts = [formatDuration(set.duration_seconds ?? 0)];
  if (set.speed_kmh != null) parts.push(`${formatNumber(set.speed_kmh)} km/h`);
  if (set.incline_pct != null) parts.push(`${formatNumber(set.incline_pct)} %`);
  if (set.distance_km != null) parts.push(`${formatNumber(set.distance_km)} km`);
  if (set.avg_heart_rate != null) parts.push(`FC ${set.avg_heart_rate}`);
  if (set.calories != null) parts.push(`${set.calories} kcal`);
  return parts.join(' · ');
}

export function formatCardioTotal(sets: WorkoutSet[]): string {
  const seconds = sets.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const withDistance = sets.filter((s) => s.distance_km != null);
  const parts = [`Total: ${formatDuration(seconds)}`];
  if (withDistance.length) {
    const km = Math.round(withDistance.reduce((sum, s) => sum + s.distance_km!, 0) * 100) / 100;
    parts.push(`${formatNumber(km)} km`);
  }
  return parts.join(' · ');
}

export function formatSegments(n: number): string {
  return `${n} ${n === 1 ? 'tramo' : 'tramos'}`;
}
```

Si TypeScript se queja de literales `Exercise` en otros specs por `kind` (no debería, es opcional) o de `ExerciseInput` sin `kind` en algún spec o API, agregar `kind: 'strength'` en ese literal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS. Si `exercise-form-page.ts` no compila porque `ExerciseInput` exige `kind`, se arregla en la Task 7; para no dejar el build roto, agrega ya el control `kind: new FormControl<ExerciseKind>('strength', { nonNullable: true })` al `FormGroup` de ese archivo (la UI se agrega en la Task 7).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core frontend/src/app/features/exercises/exercise-form-page.ts
git commit -m "feat(frontend): cardio models and segment helpers"
```

---

### Task 6: Tarjeta de cardio en la sesión

**Files:**
- Create: `frontend/src/app/features/workout/cardio-card.ts`
- Modify: `frontend/src/app/features/workout/workout-page.ts`
- Test: `frontend/src/app/features/workout/cardio-card.spec.ts`

**Interfaces:**
- Consumes: todo `cardio.ts` (Task 5), `WorkoutSessionService.addSet/updateSet/deleteSet/removeExercise` (existentes), `ConfirmService`.
- Produces: `<app-cardio-card [item] [finished] [current]>`, mismos inputs que `app-exercise-card`.

- [ ] **Step 1: Write the failing test**

`frontend/src/app/features/workout/cardio-card.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { WorkoutSet } from '../../core/models/exercise';
import type { SessionExercise } from '../../core/models/workout';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { CardioCard } from './cardio-card';

const segment = (extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: 's1', set_number: 1, set_type: 'normal', weight_kg: 0, reps: 0, side: 'both', rir: null, pain_level: null, notes: null,
  duration_seconds: 2100, speed_kmh: 5.5, incline_pct: 12, distance_km: 3.2, avg_heart_rate: null, calories: null, ...extra,
});

const walk: SessionExercise = {
  id: 'we1', exercise: { id: 1, name: 'Caminata inclinada en trotadora', uses_bodyweight: false, is_unilateral: false, kind: 'cardio' },
  position: 0, target_sets: 1, target_reps_min: null, target_reps_max: null, target_text: '35 min · 12 %',
  default_set_type: 'normal', rest_seconds: 0, notes: null,
  last_performance: { workout_id: 'w0', date: '2026-11-12', sets: [segment()] }, sets: [],
};

async function render(data: SessionExercise = walk) {
  const sessions = { addSet: vi.fn().mockResolvedValue({ id: 'new' }), updateSet: vi.fn(), deleteSet: vi.fn(), removeExercise: vi.fn() };
  const timer = { start: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkoutSessionService, useValue: sessions },
      { provide: RestTimerService, useValue: timer },
    ],
  });
  const fixture = TestBed.createComponent(CardioCard);
  fixture.componentRef.setInput('item', data);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.getAttribute('aria-label') === label || b.textContent!.trim() === label)!;
  return { fixture, el, sessions, timer, button };
}

describe('CardioCard', () => {
  it('shows the targets and last time', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('1 tramo · 35 min · 12 %');
    expect(el.textContent).toContain('Última vez: Total: 35 min · 3,2 km · 12/11/2026');
  });

  it('prefills from last time, steps the values and saves a segment without starting the rest timer', async () => {
    const { fixture, el, sessions, timer, button } = await render();
    expect(el.querySelector<HTMLInputElement>('[aria-label="Duración (min)"]')!.value).toBe('35');

    button('Sumar 1 min').click();
    button('Sumar 0,5 km/h').click();
    button('Restar 0,5 %').click();
    await fixture.whenStable();
    button('Guardar tramo').click();
    await fixture.whenStable();

    expect(sessions.addSet).toHaveBeenCalledWith('we1', expect.objectContaining({
      duration_seconds: 2160, speed_kmh: 6, incline_pct: 11.5, weight_kg: 0, reps: 0, set_type: 'normal', side: 'both',
    }));
    expect(timer.start).not.toHaveBeenCalled();
  });

  it('lists the segments with a total', async () => {
    const { el } = await render({ ...walk, sets: [segment({ id: 'a', duration_seconds: 600, distance_km: 1 }), segment({ id: 'b', duration_seconds: 300, distance_km: 0.5 })] });
    expect(el.textContent).toContain('10 min · 5,5 km/h · 12 % · 1 km');
    expect(el.textContent).toContain('Total: 15 min · 1,5 km');
  });

  it('records distance, heart rate and calories under "Más"', async () => {
    const { fixture, el, sessions, button } = await render();
    button('Más').click();
    await fixture.whenStable();
    const hr = el.querySelector<HTMLInputElement>('[aria-label="FC promedio"]')!;
    hr.value = '128';
    hr.dispatchEvent(new Event('change'));
    button('Guardar tramo').click();
    await fixture.whenStable();
    expect(sessions.addSet).toHaveBeenCalledWith('we1', expect.objectContaining({ avg_heart_rate: 128 }));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (`./cardio-card` no existe).

- [ ] **Step 3: Implement**

`frontend/src/app/features/workout/cardio-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTrash2, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { formatDate } from '../../core/format/format';
import type { WorkoutSet } from '../../core/models/exercise';
import type { SessionExercise, WorkoutSetInput } from '../../core/models/workout';
import {
  formatCardioTotal, formatSegmentLine, formatSegments, stepHalf, stepMinutes, suggestNextSegment,
} from '../../core/workout/cardio';
import { formatNumber, parseDecimal, toSetInput } from '../../core/workout/set-suggestions';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { ConfirmService } from '../../shared/ui/confirm-dialog';

/** Tarjeta de un ejercicio de cardio: tramos hechos + steppers para el próximo. Sin descanso ni progresión. */
@Component({
  selector: 'app-cardio-card',
  imports: [NgIcon, HlmButton],
  providers: [provideIcons({ lucideTrash2, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let ex = item();
    <article class="card p-4" [class.border-2]="current()" [class.border-primary]="current()">
      <header class="mb-3 flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h2 class="text-lg leading-tight font-semibold">{{ ex.exercise.name }}</h2>
          @if (targetLine()) {
            <p class="num text-base text-muted-foreground">{{ targetLine() }}</p>
          }
          <p class="text-sm text-muted-foreground">{{ lastLine() }}</p>
        </div>
        @if (!finished()) {
          <button hlmBtn variant="ghost" size="icon-lg" class="shrink-0 text-muted-foreground"
            (click)="removeExercise()" aria-label="Quitar ejercicio de esta sesión">
            <ng-icon name="lucideTrash2" />
          </button>
        }
      </header>

      @if (ex.sets.length) {
        <ol class="mb-2 flex flex-col gap-1.5">
          @for (set of ex.sets; track set.id; let i = $index) {
            <li class="flex min-h-12 items-center rounded-xl bg-muted pl-3"
              [class.ring-2]="editingSetId() === set.id" [class.ring-primary]="editingSetId() === set.id">
              <button type="button" class="num flex flex-1 items-center gap-3 py-2 text-left" (click)="edit(set)">
                <span class="w-5 text-base text-muted-foreground">{{ i + 1 }}</span>
                <span class="text-lg font-semibold">{{ line(set) }}</span>
              </button>
              <button hlmBtn variant="ghost" size="icon-lg" class="text-muted-foreground"
                (click)="removeSet(set)" aria-label="Borrar tramo">
                <ng-icon name="lucideX" />
              </button>
            </li>
          }
        </ol>
        <p class="num mb-4 text-base font-semibold">{{ total() }}</p>
      }

      <div class="grid grid-cols-3 gap-2">
        <div>
          <span class="eyebrow mb-1.5 block">Duración (min)</span>
          <div class="flex items-center rounded-xl border border-border bg-background">
            <button type="button" class="h-14 w-9 shrink-0 text-2xl" aria-label="Restar 1 min"
              (click)="patch({ duration_seconds: stepMinutes(seconds(), -1) })">−</button>
            <input class="num w-full min-w-0 bg-transparent text-center text-2xl font-bold outline-none"
              inputmode="decimal" aria-label="Duración (min)" [value]="formatNumber(seconds() / 60)"
              (change)="setMinutes($any($event.target).value)" />
            <button type="button" class="h-14 w-9 shrink-0 text-2xl" aria-label="Sumar 1 min"
              (click)="patch({ duration_seconds: stepMinutes(seconds(), 1) })">+</button>
          </div>
        </div>
        <div>
          <span class="eyebrow mb-1.5 block">km/h</span>
          <div class="flex items-center rounded-xl border border-border bg-background">
            <button type="button" class="h-14 w-9 shrink-0 text-2xl" aria-label="Restar 0,5 km/h"
              (click)="patch({ speed_kmh: stepHalf(entry().speed_kmh ?? null, -0.5) })">−</button>
            <input class="num w-full min-w-0 bg-transparent text-center text-2xl font-bold outline-none"
              inputmode="decimal" aria-label="Velocidad (km/h)" [value]="show(entry().speed_kmh)"
              (change)="patch({ speed_kmh: optional($any($event.target).value) })" />
            <button type="button" class="h-14 w-9 shrink-0 text-2xl" aria-label="Sumar 0,5 km/h"
              (click)="patch({ speed_kmh: stepHalf(entry().speed_kmh ?? null, 0.5) })">+</button>
          </div>
        </div>
        <div>
          <span class="eyebrow mb-1.5 block">Incl. %</span>
          <div class="flex items-center rounded-xl border border-border bg-background">
            <button type="button" class="h-14 w-9 shrink-0 text-2xl" aria-label="Restar 0,5 %"
              (click)="patch({ incline_pct: stepHalf(entry().incline_pct ?? null, -0.5) })">−</button>
            <input class="num w-full min-w-0 bg-transparent text-center text-2xl font-bold outline-none"
              inputmode="decimal" aria-label="Inclinación (%)" [value]="show(entry().incline_pct)"
              (change)="patch({ incline_pct: optional($any($event.target).value) })" />
            <button type="button" class="h-14 w-9 shrink-0 text-2xl" aria-label="Sumar 0,5 %"
              (click)="patch({ incline_pct: stepHalf(entry().incline_pct ?? null, 0.5) })">+</button>
          </div>
        </div>
      </div>

      @if (showMore()) {
        <div class="mt-3 grid grid-cols-3 gap-2">
          <label class="eyebrow flex flex-col gap-1.5">Distancia (km)
            <input class="num h-12 rounded-xl border border-border bg-background px-3 text-lg normal-case tracking-normal"
              inputmode="decimal" aria-label="Distancia (km)" [value]="show(entry().distance_km)"
              (change)="patch({ distance_km: optional($any($event.target).value) })" />
          </label>
          <label class="eyebrow flex flex-col gap-1.5">FC prom.
            <input class="num h-12 rounded-xl border border-border bg-background px-3 text-lg normal-case tracking-normal"
              inputmode="numeric" aria-label="FC promedio" [value]="show(entry().avg_heart_rate)"
              (change)="patch({ avg_heart_rate: optionalInt($any($event.target).value) })" />
          </label>
          <label class="eyebrow flex flex-col gap-1.5">Calorías
            <input class="num h-12 rounded-xl border border-border bg-background px-3 text-lg normal-case tracking-normal"
              inputmode="numeric" aria-label="Calorías" [value]="show(entry().calories)"
              (change)="patch({ calories: optionalInt($any($event.target).value) })" />
          </label>
        </div>
      }

      <div class="mt-3 flex gap-2">
        <button hlmBtn variant="ghost" class="h-14" (click)="showMore.set(!showMore())">
          {{ showMore() ? 'Menos' : 'Más' }}
        </button>
        <button hlmBtn class="num h-14 flex-1 text-xl font-bold tracking-wide uppercase" (click)="save()">
          {{ editingSetId() ? 'Actualizar' : 'Guardar tramo' }}
        </button>
      </div>
      @if (editingSetId()) {
        <button type="button" class="mt-2 text-sm text-muted-foreground underline" (click)="cancelEdit()">
          Cancelar edición
        </button>
      }
    </article>
  `,
})
export class CardioCard {
  private readonly confirm = inject(ConfirmService);
  private readonly sessions = inject(WorkoutSessionService);

  readonly item = input.required<SessionExercise>();
  readonly finished = input(false);
  readonly current = input(false);

  protected readonly stepMinutes = stepMinutes;
  protected readonly stepHalf = stepHalf;
  protected readonly formatNumber = formatNumber;

  protected readonly entry = linkedSignal<WorkoutSetInput>(() => suggestNextSegment(this.item()));
  protected readonly seconds = computed(() => this.entry().duration_seconds ?? 0);
  protected readonly editingSetId = signal<string | null>(null);
  protected readonly showMore = signal(false);
  protected readonly total = computed(() => formatCardioTotal(this.item().sets));

  protected readonly targetLine = computed(() => {
    const ex = this.item();
    return [ex.target_sets !== null ? formatSegments(ex.target_sets) : null, ex.target_text].filter(Boolean).join(' · ');
  });

  protected readonly lastLine = computed(() => {
    const last = this.item().last_performance;
    return last?.sets.length
      ? `Última vez: ${formatCardioTotal(last.sets)} · ${formatDate(last.date)}`
      : 'Sin registros anteriores';
  });

  protected line(set: WorkoutSet): string {
    return formatSegmentLine(set);
  }

  protected show(value: number | null | undefined): string {
    return value == null ? '' : formatNumber(value);
  }

  protected optional(text: string): number | null {
    return text.trim() === '' ? null : parseDecimal(text, 0);
  }

  protected optionalInt(text: string): number | null {
    const value = this.optional(text);
    return value === null ? null : Math.round(value);
  }

  protected setMinutes(text: string): void {
    const minutes = parseDecimal(text, this.seconds() / 60);
    this.patch({ duration_seconds: Math.max(60, Math.round(minutes * 60)) });
  }

  protected patch(changes: Partial<WorkoutSetInput>): void {
    this.entry.update((current) => ({ ...current, ...changes }));
  }

  protected edit(set: WorkoutSet): void {
    this.editingSetId.set(set.id);
    this.entry.set(toSetInput(set));
  }

  protected cancelEdit(): void {
    this.editingSetId.set(null);
    this.entry.set(suggestNextSegment(this.item()));
  }

  protected async save(): Promise<void> {
    const editing = this.editingSetId();
    if (editing) {
      await this.sessions.updateSet(this.item().id, editing, this.entry());
      this.editingSetId.set(null);
      return;
    }
    await this.sessions.addSet(this.item().id, this.entry());
  }

  protected async removeSet(set: WorkoutSet): Promise<void> {
    if (!(await this.confirm.ask({ title: '¿Borrar este tramo?', confirmLabel: 'Borrar', destructive: true }))) return;
    await this.sessions.deleteSet(this.item().id, set.id);
    if (this.editingSetId() === set.id) this.editingSetId.set(null);
  }

  protected async removeExercise(): Promise<void> {
    const ex = this.item();
    const ok = await this.confirm.ask({
      title: `¿Quitar ${ex.exercise.name} de esta sesión?`,
      message: ex.sets.length ? `Se borrarán sus ${ex.sets.length} tramos.` : undefined,
      confirmLabel: 'Quitar',
      destructive: true,
    });
    if (!ok) return;
    await this.sessions.removeExercise(ex.id);
  }
}
```

`workout-page.ts`: importar `CardioCard` e `isCardio`, sumar `CardioCard` a `imports`, exponer `protected readonly isCardio = isCardio;` y cambiar el `@for`:

```html
        @for (item of s.exercises; track item.id) {
          @if (isCardio(item.exercise)) {
            <app-cardio-card [item]="item" [finished]="!isActive()" [current]="item.id === currentId()" />
          } @else {
            <app-exercise-card [item]="item" [finished]="!isActive()" [current]="item.id === currentId()" />
          }
        } @empty {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/workout
git commit -m "feat(workout): cardio card with segments"
```

---

### Task 7: Tipo en el formulario de ejercicio

**Files:**
- Modify: `frontend/src/app/features/exercises/exercise-form-page.ts`
- Test: `frontend/src/app/features/exercises/exercise-form-page.spec.ts`

**Interfaces:**
- Consumes: `ExerciseKind`, `ExerciseInput.kind` (Task 5).

- [ ] **Step 1: Write the failing tests**

En `exercise-form-page.spec.ts`, dentro de `describe('ExerciseFormPage')`:

```ts
  it('hides the muscles for a cardio exercise and saves its kind', async () => {
    const { fixture, el, api } = await setup();
    const kind = el.querySelector<HTMLSelectElement>('#kind')!;
    kind.value = kind.options[1].value; // Cardio
    kind.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(el.querySelector('#muscle_group')).toBeNull();
    expect(el.querySelector('[data-secondary]')).toBeNull();
    expect(el.textContent).not.toContain('Unilateral');

    const name = el.querySelector<HTMLInputElement>('#name')!;
    name.value = 'Caminata';
    name.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'cardio' }));
  });

  it('locks the kind of an exercise with history', async () => {
    const api = {
      create: vi.fn(), update: vi.fn(),
      get: vi.fn().mockResolvedValue({
        id: 3, name: 'Press', kind: 'strength', muscle_group: 'chest', secondary_muscles: [], equipment: 'barbell',
        is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null, has_history: true,
      }),
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ExercisesApi, useValue: api }] });
    const fixture = TestBed.createComponent(ExerciseFormPage);
    fixture.componentRef.setInput('id', '3');
    await fixture.whenStable();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#kind')!.disabled).toBe(true);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (`#kind` no existe).

- [ ] **Step 3: Implement**

En `exercise-form-page.ts`:
- Import `ExerciseKind` desde `../../core/models/exercise`.
- El control `kind` del `FormGroup` (si la Task 5 ya lo agregó, déjalo): `kind: new FormControl<ExerciseKind>('strength', { nonNullable: true }),`
- Signal: `protected readonly cardio = toSignal(this.form.controls.kind.valueChanges.pipe(map((k) => k === 'cardio')), { initialValue: false });` (con `import { map } from 'rxjs';`).
- En `ngOnInit`, tras `patchValue`: `if (exercise.has_history) this.form.controls.kind.disable();` (`getRawValue()` sigue enviando `kind`). Y `this.form.patchValue({ ...exercise, kind: exercise.kind ?? 'strength' })`.
- Template, justo después del bloque del nombre:

```html
      <div class="flex flex-col gap-2">
        <label hlmLabel for="kind">Tipo</label>
        <select id="kind" formControlName="kind" [class]="selectClass">
          <option value="strength">Fuerza</option>
          <option value="cardio">Cardio</option>
        </select>
        @if (form.controls.kind.disabled) {
          <p class="text-sm text-muted-foreground">Tiene historial: el tipo no se puede cambiar.</p>
        }
      </div>
```

- Envolver en `@if (!cardio()) { … }` el `<div>` de "Grupo muscular" (dejando "Equipamiento" visible; si el grid de 2 columnas queda con una sola, está bien), el `<fieldset>` de secundarios y los dos `<label>` de unilateral y peso corporal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/exercises/exercise-form-page.ts frontend/src/app/features/exercises/exercise-form-page.spec.ts
git commit -m "feat(exercises): strength or cardio in the exercise form"
```

---

### Task 8: Cardio en rutinas y en Hoy

**Files:**
- Modify: `frontend/src/app/features/routines/routine-exercise-form.ts`
- Modify: `frontend/src/app/features/routines/routine-day-page.ts`
- Modify: `frontend/src/app/features/today/today-page.ts`
- Test: `frontend/src/app/features/routines/routine-exercise-form.spec.ts`, `frontend/src/app/features/today/today-page.spec.ts`

**Interfaces:**
- Consumes: `isCardio`, `formatSegments`, `formatCardioTotal` (Task 5).

- [ ] **Step 1: Write the failing tests**

En `routine-exercise-form.spec.ts`:

```ts
const walk: Exercise = {
  id: 8, name: 'Caminata inclinada', kind: 'cardio', muscle_group: 'other', secondary_muscles: [], equipment: 'machine',
  is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
};

  it('plans cardio as segments with a free target', async () => {
    const fixture = TestBed.createComponent(RoutineExerciseForm);
    fixture.componentRef.setInput('exercises', [walk]);
    fixture.componentRef.setInput('initial', null);
    fixture.componentRef.setInput('submitLabel', 'Agregar');
    await fixture.whenStable();
    let emitted: RoutineDayExerciseInput | undefined;
    fixture.componentInstance.saved.subscribe((value) => (emitted = value));

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[role=option]')?.click();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#target_reps_min')).toBeNull();
    expect(el.querySelector('#rest_seconds')).toBeNull();
    expect(el.querySelector('label[for=target_sets]')!.textContent).toContain('Tramos');

    fixture.componentInstance['form'].patchValue({ target_text: '35 min · 12 %' });
    fixture.componentInstance['submit']();

    expect(emitted).toEqual({
      exercise_id: 8, target_sets: 1, target_reps_min: null, target_reps_max: null, target_text: '35 min · 12 %',
      default_set_type: 'normal', rest_seconds: 0, notes: null,
    });
  });
```

(el `it` va dentro del `describe` existente; la constante `walk`, junto a `pullUps`).

En `today-page.spec.ts` (usa los fixtures `bench` y `today` del archivo):

```ts
  it('shows a cardio item as segments with its last total', async () => {
    const walk = { ...bench, id: 2, name: 'Caminata inclinada', kind: 'cardio' as const, muscle_group: 'other' as const, equipment: 'machine' as const };
    const segment = {
      id: 'c1', set_number: 1, set_type: 'normal' as const, weight_kg: 0, reps: 0, side: 'both' as const,
      rir: null, pain_level: null, notes: null, duration_seconds: 2100, distance_km: 3.2,
    };
    const day = today.day!;
    const { text } = await render({
      ...today,
      day: {
        ...day,
        exercises: [{
          ...day.exercises[0], id: 101, exercise: walk, default_set_type: 'normal', target_text: '35 min · 12 %',
          rest_seconds: 0, last_performance: { workout_id: 'w2', date: '2026-11-12', sets: [segment] },
        }],
      },
    });
    expect(text).toContain('1 tramo');
    expect(text).toContain('Última vez: Total: 35 min · 3,2 km · 12/11/2026');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implement**

`routine-exercise-form.ts`:
- Imports: `computed`, `toSignal` (`@angular/core/rxjs-interop`), `isCardio` (`../../core/workout/cardio`).
- Signal del ejercicio elegido y si es cardio:

```ts
  private readonly exerciseId = toSignal(this.form.controls.exercise_id.valueChanges, { initialValue: null });
  protected readonly cardio = computed(() => {
    const initial = this.initial();
    if (initial) return isCardio(initial.exercise);
    const exercise = this.exercises()?.find((e) => e.id === this.exerciseId());
    return exercise ? isCardio(exercise) : false;
  });
```

  (declararlo después de `form`).
- Al elegir un ejercicio de cardio en un ítem nuevo, partir con 1 tramo: en el constructor,

```ts
  constructor() {
    this.form.controls.exercise_id.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const exercise = this.exercises()?.find((e) => e.id === id);
      if (!this.initial() && exercise && isCardio(exercise)) this.form.controls.target_sets.setValue(1);
    });
  }
```

- Template: en el grid de 3 columnas, el label de `target_sets` pasa a `{{ cardio() ? 'Tramos' : 'Series' }}`; envolver los dos `<div>` de reps en `@if (!cardio()) { … }`; envolver todo el grid de "Tipo de serie" + "Descanso" en `@if (!cardio()) { … }`; placeholder de `target_text`: `[placeholder]="cardio() ? 'Ej.: 35 min · 12 %' : 'Ej.: ~30 reps explosivas'"` (quitar el `placeholder` fijo).
- En `submit()`, la validación de reps solo aplica a fuerza y el payload de cardio va neutro:

```ts
    const cardio = this.cardio();
    if (!cardio && value.target_reps_min !== null && value.target_reps_max !== null && value.target_reps_max < value.target_reps_min) {
      …
    }
    this.error.set(null);
    this.saved.emit({
      ...value,
      exercise_id: value.exercise_id,
      ...(cardio ? { target_reps_min: null, target_reps_max: null, default_set_type: 'normal' as const, rest_seconds: 0 } : {}),
      target_text: value.target_text || null,
      notes: value.notes || null,
    });
```

`routine-day-page.ts`, línea de cada ítem (hoy `{{ formatTargets(item) }} · {{ setTypeLabels[item.default_set_type] }} · {{ formatRest(item.rest_seconds) }}`):

```html
                    @if (isCardio(item.exercise)) {
                      {{ formatSegments(item.target_sets) }}
                    } @else {
                      {{ formatTargets(item) }} · {{ setTypeLabels[item.default_set_type] }} · {{ formatRest(item.rest_seconds) }}
                    }
```

con `protected readonly isCardio = isCardio; protected readonly formatSegments = formatSegments;`.

`today-page.ts`:
- `<p class="num text-lg text-muted-foreground">{{ isCardio(item.exercise) ? formatSegments(item.target_sets) : formatTargets(item) }}</p>`
- El chip de tipo de serie solo para fuerza: `@if (!isCardio(item.exercise) && item.default_set_type !== 'normal')`.
- `lastTime`:

```ts
  protected lastTime(item: TodayExercise): string {
    const last = item.last_performance;
    if (last && isCardio(item.exercise)) return `Última vez: ${formatCardioTotal(last.sets)} · ${formatDate(last.date)}`;
    const best = last ? formatBestSet(last.sets, item.exercise.uses_bodyweight) : null;
    return last && best ? `Última vez: ${best} · ${formatDate(last.date)}` : 'Sin registros todavía';
  }
```

- `totalSets` no cambia (los tramos objetivo suman como series en el encabezado; aceptable).
- Exponer `isCardio` y `formatSegments` como `protected readonly`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/routines frontend/src/app/features/today
git commit -m "feat(routines): cardio items as segments with a free target"
```

---

### Task 9: "Cardio" en listas y fichas de ejercicios

**Files:**
- Create: `frontend/src/app/shared/ui/exercise-thumb.ts`
- Modify: `frontend/src/app/features/exercises/exercises-page.ts`, `library-list.ts`, `exercise-detail-page.ts`, `library-detail-page.ts`
- Test: `frontend/src/app/shared/ui/exercise-thumb.spec.ts`, `frontend/src/app/core/models/labels.spec.ts`

**Interfaces:**
- Consumes: `categoryLabel` (Task 5).
- Produces: `<app-exercise-thumb [exercise]>` con `exercise: { kind?: ExerciseKind; muscle_group: MuscleGroup; secondary_muscles: MuscleGroup[] }`: mini mapa corporal para fuerza, ícono de corazón para cardio.

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/shared/ui/exercise-thumb.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ExerciseThumb } from './exercise-thumb';

describe('ExerciseThumb', () => {
  it('draws the body map for strength and a heart for cardio', async () => {
    const fixture = TestBed.createComponent(ExerciseThumb);
    fixture.componentRef.setInput('exercise', { muscle_group: 'chest', secondary_muscles: [] });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-mini-body-map')).not.toBeNull();

    fixture.componentRef.setInput('exercise', { kind: 'cardio', muscle_group: 'other', secondary_muscles: [] });
    await fixture.whenStable();
    expect(el.querySelector('app-mini-body-map')).toBeNull();
    expect(el.querySelector('[data-cardio]')).not.toBeNull();
  });
});
```

`frontend/src/app/core/models/labels.spec.ts` (nuevo):

```ts
import { describe, expect, it } from 'vitest';
import { categoryLabel } from './labels';

describe('categoryLabel', () => {
  it('names cardio as such and strength by its primary muscle', () => {
    expect(categoryLabel({ kind: 'cardio', muscle_group: 'other' })).toBe('Cardio');
    expect(categoryLabel({ kind: 'strength', muscle_group: 'chest' })).toBe('Pecho');
    expect(categoryLabel({ muscle_group: 'other' })).toBe('Otro');
  });
});
```

(Si `MUSCLE_GROUP_LABELS.other` no es `'Otro'`, usa su valor real.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implement**

`frontend/src/app/shared/ui/exercise-thumb.ts`:

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHeartPulse } from '@ng-icons/lucide';
import type { ExerciseKind, MuscleGroup } from '../../core/models/exercise';
import { MiniBodyMap } from './body-map/mini-body-map';

/** Miniatura de un ejercicio en las listas: mapa corporal (fuerza) o corazón (cardio). */
@Component({
  selector: 'app-exercise-thumb',
  imports: [MiniBodyMap, NgIcon],
  providers: [provideIcons({ lucideHeartPulse })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let ex = exercise();
    @if (ex.kind === 'cardio') {
      <span data-cardio class="flex h-14 w-[22px] items-center justify-center text-primary" aria-hidden="true">
        <ng-icon name="lucideHeartPulse" size="22" />
      </span>
    } @else {
      <app-mini-body-map [primary]="ex.muscle_group" [secondaries]="ex.secondary_muscles" />
    }
  `,
})
export class ExerciseThumb {
  readonly exercise = input.required<{ kind?: ExerciseKind; muscle_group: MuscleGroup; secondary_muscles: MuscleGroup[] }>();
}
```

`exercises-page.ts` y `library-list.ts`: reemplazar `<app-mini-body-map [primary]="exercise.muscle_group" [secondaries]="exercise.secondary_muscles" />` por `<app-exercise-thumb [exercise]="exercise" />` (cambiar `MiniBodyMap` por `ExerciseThumb` en `imports`) y `{{ muscleLabels[exercise.muscle_group] }}` por `{{ categoryLabel(exercise) }}` (exponer `protected readonly categoryLabel = categoryLabel;`).

`exercise-detail-page.ts`: `{{ muscleLabels[ex.muscle_group] }}` → `{{ categoryLabel(ex) }}`; envolver la `<section … aria-label="Músculos que trabaja">` en `@if (ex.kind !== 'cardio') { … }`.

`library-detail-page.ts`: envolver la `<section class="card mb-6 p-4">` del mapa corporal en `@if (ex.kind !== 'cardio') { … }` y anteponer `Cardio · ` al subtítulo cuando `ex.kind === 'cardio'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/ui/exercise-thumb.ts frontend/src/app/shared/ui/exercise-thumb.spec.ts frontend/src/app/core/models/labels.spec.ts frontend/src/app/features/exercises
git commit -m "feat(exercises): cardio label and icon in lists and details"
```

---

### Task 10: Verificación completa

- [ ] **Step 1: Backend**

Run: `cd backend && ./vendor/bin/pint && ./vendor/bin/pest`
Expected: pint sin cambios pendientes (o commitear `style: pint`), Pest todo PASS.

- [ ] **Step 2: Frontend**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: tests PASS y build sin errores.

- [ ] **Step 3: Migraciones en Postgres**

Run: `docker compose exec backend php artisan migrate`
Expected: corren `2026_11_16_000001` y `2026_11_16_000002` sin error.

- [ ] **Step 4: Prueba manual (Luciano)**

Con `docker compose up -d` y `cd frontend && npm start`: adoptar "Caminata inclinada en trotadora" desde la biblioteca, agregarla a un día de rutina con "35 min · 12 %", empezar el día, registrar un tramo y revisar que en Estadísticas no aparece en el mapa corporal ni en series por músculo.

- [ ] **Step 5: Commit** (solo si quedó algo de pint)

```bash
git commit -am "style: pint"
```
