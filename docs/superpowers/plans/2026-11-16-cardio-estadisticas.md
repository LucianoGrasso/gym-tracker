# Cardio (plan 2: estadísticas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver el cardio en Estadísticas: tarjeta de resumen del período y detalle por ejercicio con una métrica a la vez (duración, distancia, inclinación, velocidad, FC).

**Architecture:** `StatsDataLoader::cardioSegments()` aplana los tramos en `CardioRow`; `CardioService` (sin BD) calcula el resumen y el progreso por sesión con promedios ponderados por duración. `OverviewService` suma el bloque `cardio` y los ejercicios de cardio a su lista. `StatsController::exercise` responde distinto según `kind`. En el frontend, un componente `CardioStats` para el detalle y una tarjeta en `stats-page`.

**Tech Stack:** Laravel 13 + Pest; Angular 22 + ngx-echarts + Vitest.

Spec: `docs/superpowers/specs/2026-11-16-cardio-design.md`, sección 4. El filtro de fuerza (`sets()` solo `strength`) ya está hecho (plan 1, Task 4).

## Global Constraints

- Rama `cardio`. Lógica de estadísticas en `app/Services/Stats`, nunca en controladores.
- Promedios de velocidad, inclinación y FC **ponderados por duración**, solo con los tramos que tienen el dato; `null` si ninguno. Velocidad e inclinación con 1 decimal, FC entera.
- `summary`: `minutes` entero (suma/60 redondeada), `sessions` = workouts distintos, `distance_km` suma con 2 decimales (0.0 sin datos).
- `progress`: `minutes` con 1 decimal; `distance_km` y `calories` suma o `null`.
- Tarjeta "Cardio" oculta si `cardio.sessions = 0`. Chips sin ningún dato no se muestran.
- Respuestas guardadas en caché antes de este cambio pueden no traer `cardio` ni `kind`: tipos opcionales en el frontend.
- Comandos: `cd backend && ./vendor/bin/pest`; `cd frontend && npx ng test --watch=false`.

---

### Task 1: `CardioRow`, carga de tramos y `CardioService`

**Files:**
- Create: `backend/app/Services/Stats/CardioRow.php`
- Create: `backend/app/Services/Stats/CardioService.php`
- Modify: `backend/app/Services/Stats/StatsDataLoader.php`
- Test: `backend/tests/Unit/Stats/CardioServiceTest.php`, `backend/tests/Feature/Api/StatsDataLoaderTest.php`

**Interfaces:**
- Produces:
  - `CardioRow(workoutId: string, date: string, exerciseId: int, exerciseName: string, durationSeconds: int, speedKmh: ?float, inclinePct: ?float, distanceKm: ?float, avgHeartRate: ?int, calories: ?int)`
  - `StatsDataLoader::cardioSegments(?int $exerciseId = null): Collection<int, CardioRow>`
  - `CardioService::summary(Collection $rows, ?string $from): array{minutes:int, sessions:int, distance_km:float}`
  - `CardioService::progress(Collection $rows, ?string $from): list<array{workout_id:string, date:string, minutes:float, distance_km:?float, calories:?int, avg_speed_kmh:?float, avg_incline_pct:?float, avg_heart_rate:?int}>`

- [ ] **Step 1: Write the failing tests**

`backend/tests/Unit/Stats/CardioServiceTest.php`:

```php
<?php

use App\Services\Stats\CardioRow;
use App\Services\Stats\CardioService;

function cardioRow(array $overrides = []): CardioRow
{
    $data = array_merge([
        'workoutId' => 'w1', 'date' => '2026-11-11', 'exerciseId' => 1, 'exerciseName' => 'Caminata',
        'durationSeconds' => 1800, 'speedKmh' => null, 'inclinePct' => null, 'distanceKm' => null,
        'avgHeartRate' => null, 'calories' => null,
    ], $overrides);

    return new CardioRow(...$data);
}

it('summarizes minutes, sessions and distance of the period', function () {
    $rows = collect([
        cardioRow(['workoutId' => 'old', 'date' => '2026-09-01', 'durationSeconds' => 3600, 'distanceKm' => 5.0]),
        cardioRow(['workoutId' => 'w1', 'durationSeconds' => 600, 'distanceKm' => 1.2]),
        cardioRow(['workoutId' => 'w1', 'durationSeconds' => 1530]),
        cardioRow(['workoutId' => 'w2', 'date' => '2026-11-13', 'durationSeconds' => 2100, 'distanceKm' => 3.25]),
    ]);

    expect((new CardioService)->summary($rows, '2026-10-16'))
        ->toBe(['minutes' => 71, 'sessions' => 2, 'distance_km' => 4.45]);
});

it('summarizes an empty period with zeros', function () {
    expect((new CardioService)->summary(collect(), null))->toBe(['minutes' => 0, 'sessions' => 0, 'distance_km' => 0.0]);
});

it('weights the averages by duration, skipping segments without the value', function () {
    $rows = collect([
        cardioRow(['durationSeconds' => 600, 'speedKmh' => 8.0, 'inclinePct' => 1.0, 'avgHeartRate' => 160, 'calories' => 100, 'distanceKm' => 1.3]),
        cardioRow(['durationSeconds' => 1800, 'speedKmh' => 5.0, 'inclinePct' => 12.0, 'calories' => 200]),
        cardioRow(['durationSeconds' => 900]),
    ]);

    expect((new CardioService)->progress($rows, null))->toBe([[
        'workout_id' => 'w1', 'date' => '2026-11-11', 'minutes' => 55.0, 'distance_km' => 1.3, 'calories' => 300,
        'avg_speed_kmh' => 5.8, 'avg_incline_pct' => 9.3, 'avg_heart_rate' => 160,
    ]]);
});

it('gives one entry per session in order, with nulls when nothing was recorded', function () {
    $rows = collect([
        cardioRow(['workoutId' => 'a', 'date' => '2026-11-04', 'durationSeconds' => 1200]),
        cardioRow(['workoutId' => 'b', 'date' => '2026-11-11', 'durationSeconds' => 2100, 'inclinePct' => 12.0]),
    ]);

    $progress = (new CardioService)->progress($rows, '2026-11-01');

    expect(array_column($progress, 'workout_id'))->toBe(['a', 'b'])
        ->and($progress[0])->toMatchArray(['minutes' => 20.0, 'distance_km' => null, 'calories' => null, 'avg_incline_pct' => null])
        ->and($progress[1]['avg_incline_pct'])->toBe(12.0);
});
```

En `StatsDataLoaderTest.php`:

```php
it('flattens own cardio segments, optionally for one exercise', function () {
    $walk = Exercise::factory()->for($this->user)->create(['name' => 'Caminata', 'kind' => ExerciseKind::Cardio, 'muscle_group' => MuscleGroup::Other]);
    $bike = Exercise::factory()->for($this->user)->create(['name' => 'Bicicleta', 'kind' => ExerciseKind::Cardio, 'muscle_group' => MuscleGroup::Other]);
    $bench = Exercise::factory()->for($this->user)->create(['name' => 'Press']);
    loggedWorkout($this->user, $bench, '2026-11-10', [[60, 8, SetType::Normal]]);
    $workout = loggedWorkout($this->user, $walk, '2026-11-11', [[0, 0, SetType::Normal]]);
    WorkoutSet::query()->update(['duration_seconds' => 2100, 'speed_kmh' => 5.5, 'incline_pct' => 12, 'distance_km' => 3.2, 'avg_heart_rate' => 128, 'calories' => 250]);
    loggedWorkout($this->user, $bike, '2026-11-12', [[0, 0, SetType::Normal]]);
    WorkoutSet::query()->whereNull('duration_seconds')->update(['duration_seconds' => 600]);
    $other = User::factory()->create();
    loggedWorkout($other, Exercise::factory()->for($other)->create(['kind' => ExerciseKind::Cardio]), '2026-11-12', [[0, 0, SetType::Normal]]);

    $loader = app(StatsDataLoader::class);
    $rows = $loader->cardioSegments();

    expect($rows->pluck('exerciseName')->all())->toBe(['Caminata', 'Bicicleta'])
        ->and($rows->first())->toEqual(new CardioRow(
            workoutId: $workout->id, date: '2026-11-11', exerciseId: $walk->id, exerciseName: 'Caminata',
            durationSeconds: 2100, speedKmh: 5.5, inclinePct: 12.0, distanceKm: 3.2, avgHeartRate: 128, calories: 250,
        ))
        ->and($loader->cardioSegments($bike->id)->pluck('exerciseName')->all())->toBe(['Bicicleta']);
});
```

(con `use App\Services\Stats\CardioRow;`; el `WorkoutSet::query()->update` del primer paso también toca la serie de fuerza, que no importa porque `cardioSegments` la excluye; el de la bici solo completa la que quedó sin duración… pero la de fuerza ya tiene duración: está bien, no se lee).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && ./vendor/bin/pest --filter="CardioServiceTest|StatsDataLoaderTest"`
Expected: FAIL (clases inexistentes).

- [ ] **Step 3: Implement**

`CardioRow.php`:

```php
<?php

namespace App\Services\Stats;

/** One cardio segment, flattened with what the stats need. */
final readonly class CardioRow
{
    public function __construct(
        public string $workoutId,
        public string $date,
        public int $exerciseId,
        public string $exerciseName,
        public int $durationSeconds,
        public ?float $speedKmh,
        public ?float $inclinePct,
        public ?float $distanceKm,
        public ?int $avgHeartRate,
        public ?int $calories,
    ) {}
}
```

`StatsDataLoader.php`, después de `sets()`:

```php
    /**
     * Every cardio segment of the authenticated user (archived exercises included), oldest first.
     *
     * @return Collection<int, CardioRow>
     */
    public function cardioSegments(?int $exerciseId = null): Collection
    {
        return DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workouts as w', 'w.id', '=', 'we.workout_id')
            ->join('exercises as e', 'e.id', '=', 'we.exercise_id')
            ->where('w.user_id', auth()->id())
            ->where('e.kind', ExerciseKind::Cardio->value)
            ->when($exerciseId, fn ($query) => $query->where('we.exercise_id', $exerciseId))
            ->orderBy('w.date')
            ->orderBy('w.started_at')
            ->orderBy('we.position')
            ->orderBy('s.set_number')
            ->get([
                'w.id as workout_id', 'w.date', 'we.exercise_id', 'e.name as exercise_name', 's.duration_seconds',
                's.speed_kmh', 's.incline_pct', 's.distance_km', 's.avg_heart_rate', 's.calories',
            ])
            ->map(fn (object $row) => new CardioRow(
                workoutId: $row->workout_id,
                date: substr((string) $row->date, 0, 10),
                exerciseId: (int) $row->exercise_id,
                exerciseName: $row->exercise_name,
                durationSeconds: (int) $row->duration_seconds,
                speedKmh: $row->speed_kmh === null ? null : (float) $row->speed_kmh,
                inclinePct: $row->incline_pct === null ? null : (float) $row->incline_pct,
                distanceKm: $row->distance_km === null ? null : (float) $row->distance_km,
                avgHeartRate: $row->avg_heart_rate === null ? null : (int) $row->avg_heart_rate,
                calories: $row->calories === null ? null : (int) $row->calories,
            ));
    }
```

`CardioService.php`:

```php
<?php

namespace App\Services\Stats;

use Illuminate\Support\Collection;

final class CardioService
{
    /**
     * @param  Collection<int, CardioRow>  $rows
     * @return array{minutes: int, sessions: int, distance_km: float}
     */
    public function summary(Collection $rows, ?string $from): array
    {
        $inPeriod = $this->inPeriod($rows, $from);

        return [
            'minutes' => (int) round($inPeriod->sum('durationSeconds') / 60),
            'sessions' => $inPeriod->pluck('workoutId')->unique()->count(),
            'distance_km' => round((float) $inPeriod->sum(fn (CardioRow $row) => $row->distanceKm ?? 0), 2),
        ];
    }

    /**
     * @param  Collection<int, CardioRow>  $rows  oldest first
     * @return list<array{workout_id: string, date: string, minutes: float, distance_km: ?float, calories: ?int, avg_speed_kmh: ?float, avg_incline_pct: ?float, avg_heart_rate: ?int}>
     */
    public function progress(Collection $rows, ?string $from): array
    {
        return $this->inPeriod($rows, $from)
            ->groupBy('workoutId')
            ->map(function (Collection $segments) {
                $heartRate = $this->weighted($segments, fn (CardioRow $row) => $row->avgHeartRate);

                return [
                    'workout_id' => $segments->first()->workoutId,
                    'date' => $segments->first()->date,
                    'minutes' => round($segments->sum('durationSeconds') / 60, 1),
                    'distance_km' => $this->total($segments, fn (CardioRow $row) => $row->distanceKm, 2),
                    'calories' => ($calories = $this->total($segments, fn (CardioRow $row) => $row->calories, 0)) === null ? null : (int) $calories,
                    'avg_speed_kmh' => $this->round($this->weighted($segments, fn (CardioRow $row) => $row->speedKmh), 1),
                    'avg_incline_pct' => $this->round($this->weighted($segments, fn (CardioRow $row) => $row->inclinePct), 1),
                    'avg_heart_rate' => $heartRate === null ? null : (int) round($heartRate),
                ];
            })
            ->values()
            ->all();
    }

    /** @param  Collection<int, CardioRow>  $rows */
    private function inPeriod(Collection $rows, ?string $from): Collection
    {
        return $rows->filter(fn (CardioRow $row) => $from === null || $row->date >= $from);
    }

    /** Average of the segments that have the value, weighted by their duration. */
    private function weighted(Collection $segments, callable $value): ?float
    {
        $with = $segments->filter(fn (CardioRow $row) => $value($row) !== null && $row->durationSeconds > 0);
        $seconds = $with->sum('durationSeconds');

        return $seconds === 0 ? null : $with->sum(fn (CardioRow $row) => $value($row) * $row->durationSeconds) / $seconds;
    }

    private function total(Collection $segments, callable $value, int $precision): ?float
    {
        $values = $segments->map($value)->filter(fn ($v) => $v !== null);

        return $values->isEmpty() ? null : round((float) $values->sum(), $precision);
    }

    private function round(?float $value, int $precision): ?float
    {
        return $value === null ? null : round($value, $precision);
    }
}
```

(Agregar `use App\Enums\ExerciseKind;` en el loader si no está — ya está desde el plan 1.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Stats backend/tests
git commit -m "feat(stats): cardio segments and cardio service"
```

---

### Task 2: Endpoints de overview y de ejercicio

**Files:**
- Modify: `backend/app/Services/Stats/OverviewService.php`
- Modify: `backend/app/Http/Controllers/StatsController.php`
- Test: `backend/tests/Unit/Stats/OverviewTest.php`, `backend/tests/Feature/Api/StatsTest.php`

**Interfaces:**
- Consumes: `cardioSegments`, `CardioService` (Task 1).
- Produces:
  - `OverviewService::overview(Collection $sets, array $workoutDates, CarbonImmutable $today, ?string $from, ?Collection $cardio = null)`: suma `cardio` (summary) y cada elemento de `exercises` lleva `kind`; los de cardio salen de `$cardio` (sesiones = workouts distintos, todo el historial como hoy).
  - `GET /api/stats/exercises/{id}` de cardio: `{ period, exercise: {id, name, kind: 'cardio'}, sessions: progress }`; de fuerza: `exercise.kind = 'strength'`.

- [ ] **Step 1: Write the failing tests**

En `OverviewTest.php`, el `toBe` de `exercises` del test existente pasa a:

```php
            ->and($result['exercises'])->toBe([
                ['id' => 2, 'name' => 'Dominadas', 'sessions' => 1, 'kind' => 'strength'],
                ['id' => 1, 'name' => 'Press de banca', 'sessions' => 2, 'kind' => 'strength'],
            ])
```

y se agrega (dentro del `describe('OverviewService')`):

```php
    it('adds the cardio summary and the cardio exercises', function () use ($overview, $today) {
        $sets = collect([statsSet(['workoutId' => 'b', 'date' => '2026-10-27', 'weightKg' => 85.0, 'reps' => 5])]);
        $cardio = collect([
            new CardioRow('c', '2026-11-03', 7, 'Caminata', 2100, 5.5, 12.0, 3.2, null, null),
            new CardioRow('c', '2026-11-03', 7, 'Caminata', 300, null, null, null, null, null),
        ]);

        $result = $overview->overview($sets, ['2026-10-27', '2026-11-03'], $today, '2026-10-12', $cardio);

        expect($result['cardio'])->toBe(['minutes' => 40, 'sessions' => 1, 'distance_km' => 3.2])
            ->and($result['exercises'])->toBe([
                ['id' => 7, 'name' => 'Caminata', 'sessions' => 1, 'kind' => 'cardio'],
                ['id' => 1, 'name' => 'Press de banca', 'sessions' => 1, 'kind' => 'strength'],
            ]);
    });
```

(con `use App\Services\Stats\CardioRow;`).

En `StatsTest.php`:

```php
it('returns the progress of a cardio exercise', function () {
    $walk = Exercise::factory()->for($this->user)->create(['name' => 'Caminata', 'kind' => ExerciseKind::Cardio, 'muscle_group' => MuscleGroup::Other]);
    statsWorkout($this->user, $walk, '2026-11-04', [[0, 0, SetType::Normal]]);
    WorkoutSet::query()->update(['duration_seconds' => 2100, 'incline_pct' => 12, 'distance_km' => 3.2]);

    $this->getJson("/api/stats/exercises/{$walk->id}?period=1m")
        ->assertOk()
        ->assertJsonPath('data.exercise.kind', 'cardio')
        ->assertJsonPath('data.sessions.0.minutes', 35.0)
        ->assertJsonPath('data.sessions.0.avg_incline_pct', 12.0)
        ->assertJsonMissingPath('data.records')
        ->assertJsonMissingPath('data.stalled');
});

it('adds the cardio summary to the overview', function () {
    $walk = Exercise::factory()->for($this->user)->create(['name' => 'Caminata', 'kind' => ExerciseKind::Cardio, 'muscle_group' => MuscleGroup::Other]);
    statsWorkout($this->user, $walk, '2026-11-04', [[0, 0, SetType::Normal]]);
    WorkoutSet::query()->update(['duration_seconds' => 2100, 'distance_km' => 3.2]);

    $this->getJson('/api/stats/overview?period=1m')
        ->assertOk()
        ->assertJsonPath('data.cardio', ['minutes' => 35, 'sessions' => 1, 'distance_km' => 3.2])
        ->assertJsonPath('data.exercises.0.kind', 'cardio');
});
```

y en el test `returns the progress of an exercise…` agregar `->assertJsonPath('data.exercise.kind', 'strength')`. Import `use App\Enums\ExerciseKind;`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && ./vendor/bin/pest --filter="OverviewTest|StatsTest"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`OverviewService.php`: constructor con `private readonly CardioService $cardio = new CardioService,` como tercer parámetro; firma `overview(Collection $sets, array $workoutDates, CarbonImmutable $today, ?string $from, ?Collection $cardio = null): array` (documentar `@param Collection<int, CardioRow>|null $cardio`), y:

```php
        $cardio ??= new Collection;
        $strength = $working
            ->groupBy('exerciseId')
            ->map(fn (Collection $exerciseSets) => [
                'id' => $exerciseSets->first()->exerciseId,
                'name' => $exerciseSets->first()->exerciseName,
                'sessions' => $exerciseSets->pluck('workoutId')->unique()->count(),
                'kind' => ExerciseKind::Strength->value,
            ]);
        $cardioExercises = $cardio
            ->groupBy('exerciseId')
            ->map(fn (Collection $segments) => [
                'id' => $segments->first()->exerciseId,
                'name' => $segments->first()->exerciseName,
                'sessions' => $segments->pluck('workoutId')->unique()->count(),
                'kind' => ExerciseKind::Cardio->value,
            ]);
```

y en el `return`: `'cardio' => $this->cardio->summary($cardio, $from),` y `'exercises' => $strength->values()->concat($cardioExercises->values())->sortBy('name')->values()->all(),`.

`StatsController.php`:

```php
    public function exercise(StatsRequest $request, Exercise $exercise, ExerciseProgressService $progress, StalledExercisesService $stalled, CardioService $cardio): JsonResponse
    {
        if ($exercise->kind === ExerciseKind::Cardio) {
            return $this->respond($request, [
                'exercise' => ['id' => $exercise->id, 'name' => $exercise->name, 'kind' => $exercise->kind],
                'sessions' => $cardio->progress($this->data->cardioSegments($exercise->id), $request->from()),
            ]);
        }

        $sets = $this->data->sets($exercise->id);
        …
            'exercise' => ['id' => $exercise->id, 'name' => $exercise->name, 'uses_bodyweight' => $exercise->uses_bodyweight, 'kind' => $exercise->kind],
        …
    }

    public function overview(StatsRequest $request, OverviewService $overview): JsonResponse
    {
        return $this->respond($request, $overview->overview(
            $this->data->sets(), $this->data->workoutDates(), $request->today(), $request->from(), $this->data->cardioSegments(),
        ));
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest && ./vendor/bin/pint --dirty --format agent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(stats): cardio summary in the overview and cardio exercise progress"
```

---

### Task 3: Modelos y detalle de cardio en el frontend

**Files:**
- Modify: `frontend/src/app/core/models/stats.ts`, `frontend/src/app/core/api/stats-api.ts`
- Create: `frontend/src/app/features/stats/cardio-stats.ts`
- Modify: `frontend/src/app/features/stats/exercise-stats-page.ts`
- Test: `frontend/src/app/features/stats/cardio-stats.spec.ts`

**Interfaces:**
- Produces:
  - `CardioSessionStats`, `CardioExerciseStats`, `CardioSummary`; `StatsOverview.cardio?: CardioSummary`; `StatsOverview.exercises[].kind?: ExerciseKind`; `ExerciseStats.exercise.kind?: 'strength'`.
  - `isCardioStats(stats: ExerciseStats | CardioExerciseStats): stats is CardioExerciseStats`
  - `CARDIO_METRICS`, `availableCardioMetrics(sessions)`, `formatCardioSummary(summary: CardioSummary): string` (en `cardio-stats.ts`)
  - `<app-cardio-stats [stats]>`

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/features/stats/cardio-stats.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { CardioExerciseStats, CardioSessionStats } from '../../core/models/stats';
import { CardioStats, availableCardioMetrics, formatCardioSummary } from './cardio-stats';

const session = (date: string, extra: Partial<CardioSessionStats> = {}): CardioSessionStats => ({
  workout_id: date, date, minutes: 35, distance_km: null, calories: null,
  avg_speed_kmh: null, avg_incline_pct: 12, avg_heart_rate: null, ...extra,
});

describe('cardio stats helpers', () => {
  it('offers only the metrics with data', () => {
    expect(availableCardioMetrics([session('2026-11-04'), session('2026-11-11', { distance_km: 3.2 })]).map((m) => m.label))
      .toEqual(['Duración', 'Distancia', 'Inclinación prom.']);
  });

  it('summarizes the period', () => {
    expect(formatCardioSummary({ minutes: 140, sessions: 4, distance_km: 12.3 })).toBe('140 min · 4 sesiones · 12,3 km');
    expect(formatCardioSummary({ minutes: 35, sessions: 1, distance_km: 0 })).toBe('35 min · 1 sesión');
  });
});

describe('CardioStats', () => {
  it('shows the metric chips and the sessions newest first', async () => {
    const stats: CardioExerciseStats = {
      period: '1m', exercise: { id: 7, name: 'Caminata', kind: 'cardio' },
      sessions: [session('2026-11-04', { minutes: 30 }), session('2026-11-11', { minutes: 35.5, distance_km: 3.2 })],
    };
    const fixture = TestBed.createComponent(CardioStats);
    fixture.componentRef.setInput('stats', stats);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const chips = Array.from(el.querySelectorAll('app-chip-group button')).map((b) => b.textContent!.trim());
    expect(chips).toEqual(['Duración', 'Distancia', 'Inclinación prom.']);
    const rows = Array.from(el.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('11/11/2026');
    expect(rows[0]).toContain('35,5');
    expect(rows[0]).toContain('3,2');
  });

  it('says when there are no sessions', async () => {
    const fixture = TestBed.createComponent(CardioStats);
    fixture.componentRef.setInput('stats', { period: '1m', exercise: { id: 7, name: 'Caminata', kind: 'cardio' }, sessions: [] });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin sesiones en este período.');
  });
});
```

(Si `app-chip-group` no rinde `button`, ajustar el selector al elemento que use: revisar `shared/ui/chip-group.ts`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (`./cardio-stats` no existe).

- [ ] **Step 3: Implement**

`core/models/stats.ts`:

```ts
import type { ExerciseKind, MuscleGroup } from './exercise';

export interface CardioSessionStats {
  workout_id: string;
  date: string;
  minutes: number;
  distance_km: number | null;
  calories: number | null;
  avg_speed_kmh: number | null;
  avg_incline_pct: number | null;
  avg_heart_rate: number | null;
}

export interface CardioExerciseStats {
  period: StatsPeriod;
  exercise: { id: number; name: string; kind: 'cardio' };
  sessions: CardioSessionStats[];
}

export interface CardioSummary {
  minutes: number;
  sessions: number;
  distance_km: number;
}

export function isCardioStats(stats: ExerciseStats | CardioExerciseStats): stats is CardioExerciseStats {
  return stats.exercise.kind === 'cardio';
}
```

`ExerciseStats.exercise`: `{ id: number; name: string; uses_bodyweight: boolean; kind?: 'strength' }`. `StatsOverview`: `cardio?: CardioSummary;` y `exercises: { id: number; name: string; sessions: number; kind?: ExerciseKind }[]`.

`stats-api.ts`: `exercise(id, period): Promise<ExerciseStats | CardioExerciseStats>`.

`features/stats/cardio-stats.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { formatDate } from '../../core/format/format';
import type { CardioExerciseStats, CardioSessionStats, CardioSummary } from '../../core/models/stats';
import { formatNumber } from '../../core/workout/set-suggestions';
import { lineOption } from '../../shared/charts/chart-options';
import { ChipGroup } from '../../shared/ui/chip-group';

type CardioMetricKey = 'minutes' | 'distance_km' | 'avg_incline_pct' | 'avg_speed_kmh' | 'avg_heart_rate';

/** Una métrica por gráfico (nunca dos ejes): se cambia con los chips. */
export const CARDIO_METRICS: readonly { key: CardioMetricKey; label: string; unit: string }[] = [
  { key: 'minutes', label: 'Duración', unit: 'min' },
  { key: 'distance_km', label: 'Distancia', unit: 'km' },
  { key: 'avg_incline_pct', label: 'Inclinación prom.', unit: '%' },
  { key: 'avg_speed_kmh', label: 'Velocidad prom.', unit: 'km/h' },
  { key: 'avg_heart_rate', label: 'FC prom.', unit: 'lpm' },
];

export function availableCardioMetrics(sessions: CardioSessionStats[]) {
  return CARDIO_METRICS.filter((m) => sessions.some((s) => s[m.key] !== null));
}

/** "140 min · 4 sesiones · 12,3 km" (km solo si hubo distancia). */
export function formatCardioSummary(summary: CardioSummary): string {
  const parts = [`${summary.minutes} min`, `${summary.sessions} ${summary.sessions === 1 ? 'sesión' : 'sesiones'}`];
  if (summary.distance_km > 0) parts.push(`${formatNumber(summary.distance_km)} km`);
  return parts.join(' · ');
}

@Component({
  selector: 'app-cardio-stats',
  imports: [NgxEchartsDirective, ChipGroup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stats().sessions.length) {
      <section class="card mb-6 p-4">
        <app-chip-group
          class="mb-3 block"
          label="Métrica"
          [options]="metricOptions()"
          [value]="metric()"
          (valueChange)="metric.set($any($event))"
        />
        @if (chart(); as option) {
          <div echarts [options]="option" class="h-60" role="img" [attr.aria-label]="metricLabel() + ' por sesión'"></div>
        }
      </section>

      <section class="mb-6">
        <h2 class="section-title mb-3">Sesiones</h2>
        <div class="card overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="eyebrow">
              <tr>
                <th class="px-3 py-2 font-medium">Fecha</th>
                <th class="px-3 py-2 text-right font-medium">Min</th>
                <th class="px-3 py-2 text-right font-medium">km</th>
                <th class="px-3 py-2 text-right font-medium">Incl. %</th>
                <th class="px-3 py-2 text-right font-medium">FC</th>
              </tr>
            </thead>
            <tbody class="num text-base">
              @for (row of newestFirst(); track row.workout_id) {
                <tr class="border-t border-border">
                  <td class="px-3 py-2">{{ formatDate(row.date) }}</td>
                  <td class="px-3 py-2 text-right">{{ show(row.minutes) }}</td>
                  <td class="px-3 py-2 text-right">{{ show(row.distance_km) }}</td>
                  <td class="px-3 py-2 text-right">{{ show(row.avg_incline_pct) }}</td>
                  <td class="px-3 py-2 text-right">{{ show(row.avg_heart_rate) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else {
      <p class="card mb-6 p-4 text-sm text-muted-foreground">Sin sesiones en este período.</p>
    }
  `,
})
export class CardioStats {
  readonly stats = input.required<CardioExerciseStats>();

  protected readonly formatDate = formatDate;
  protected readonly available = computed(() => availableCardioMetrics(this.stats().sessions));
  protected readonly metricOptions = computed(() => this.available().map((m) => ({ value: m.key, label: m.label })));
  protected readonly metric = linkedSignal<CardioMetricKey>(() => this.available()[0]?.key ?? 'minutes');
  private readonly selected = computed(() => CARDIO_METRICS.find((m) => m.key === this.metric())!);
  protected readonly metricLabel = computed(() => this.selected().label);
  protected readonly chart = computed(() => {
    const metric = this.selected();
    const points = this.stats().sessions.map((s) => ({ date: s.date, value: s[metric.key] }));
    return points.some((p) => p.value !== null) ? lineOption(points, metric.label, metric.unit) : null;
  });
  protected readonly newestFirst = computed(() => [...this.stats().sessions].reverse());

  protected show(value: number | null): string {
    return value === null ? '—' : formatNumber(value);
  }
}
```

`exercise-stats-page.ts`:
- Import `CardioStats` e `isCardioStats`, sumar `CardioStats` a `imports`.
- Computed:

```ts
  protected readonly cardio = computed(() => {
    const value = this.stats.value();
    return value && isCardioStats(value) ? value : null;
  });
  protected readonly strength = computed(() => {
    const value = this.stats.value();
    return value && !isCardioStats(value) ? value : null;
  });
```

- En el template: `@if (stats.value(); as s) {` → `@if (cardio(); as c) {\n      <app-cardio-stats [stats]="c" />\n    } @else if (strength(); as s) {`.
- En `chart`, `bilboChart` y `sessionsNewestFirst`, reemplazar `this.stats.value()?.sessions` por `this.strength()?.sessions`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app
git commit -m "feat(stats): cardio exercise detail with one metric at a time"
```

---

### Task 4: Tarjeta Cardio en el resumen

**Files:**
- Modify: `frontend/src/app/features/stats/stats-page.ts`

**Interfaces:**
- Consumes: `formatCardioSummary` (Task 3), `StatsOverview.cardio`.

- [ ] **Step 1: Implement** (la lógica, `formatCardioSummary`, ya está probada en la Task 3; esto es solo plantilla)

Después del `</dl>` del resumen:

```html
      @if (o.cardio?.sessions) {
        <div class="card mb-6 flex items-center gap-3 p-4">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ng-icon name="lucideHeartPulse" size="20" aria-hidden="true" />
          </span>
          <div>
            <p class="eyebrow">Cardio</p>
            <p class="num text-xl font-bold">{{ formatCardioSummary(o.cardio!) }}</p>
          </div>
        </div>
      }
```

Agregar `lucideHeartPulse` a `provideIcons` y su import, `import { formatCardioSummary } from './cardio-stats';` y `protected readonly formatCardioSummary = formatCardioSummary;`.

- [ ] **Step 2: Run tests and build**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/stats/stats-page.ts
git commit -m "feat(stats): cardio card in the overview"
```

---

### Task 5: Verificación

- [ ] `cd backend && ./vendor/bin/pint --format agent && ./vendor/bin/pest` → PASS.
- [ ] `cd frontend && npx ng test --watch=false && npx ng build` → PASS.
- [ ] Prueba manual (Luciano) en http://localhost:4200: Estadísticas muestra la tarjeta Cardio; "Por ejercicio" incluye la caminata; su detalle muestra los chips con datos y la tabla de sesiones.
