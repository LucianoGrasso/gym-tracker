# Detección de estancamiento — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listar en Estadísticas los ejercicios sin nuevo mejor 1RM estimado en 4 semanas (con ≥3 sesiones), con una descarga concreta, y avisarlo en el detalle del ejercicio.

**Architecture:** Servicio puro `StalledExercisesService` en `app/Services/Stats` (recibe `SetRow`s + ejercicios activos + hoy). `StatsController` expone `GET /api/stats/stalled` y agrega `stalled` al detalle. En Angular, `StatsApi.stalled()`, componentes `StalledNote` (texto de un ejercicio) y `StalledSection` (lista), usados en `stats-page` y `exercise-stats-page`.

**Tech Stack:** Laravel 13 + Pest; Angular 22 (Signals, standalone, zoneless) + Vitest.

Spec: `docs/superpowers/specs/2026-11-13-estancamiento-design.md`. Rama: `estancamiento`.

## Global Constraints

- `WINDOW_DAYS = 28`, `MIN_SESSIONS = 3`, `DELOAD_FACTOR = 0.9`; empate con el récord = estancado.
- Escalón de descarga: barbell/smith/dumbbell 2,5 · machine/cable 5 · kettlebell 4 · bodyweight/band y ejercicios con `uses_bodyweight` → `null`.
- Lógica de estadísticas solo en `app/Services/Stats`; el controlador es pegamento.
- Textos de UI en español (Chile), fechas `dd/mm/aaaa` (`formatDate`), kg con coma (`formatKg`).
- Tests backend: `cd backend && ./vendor/bin/pest`. Frontend: `cd frontend && npx ng test --watch=false`. No encadenar `| tail && git commit`.

## Archivos

| Archivo | Cambio |
|---|---|
| `backend/app/Services/Stats/StalledExercisesService.php` | **nuevo** |
| `backend/tests/Unit/Stats/StalledExercisesTest.php` | **nuevo** |
| `backend/app/Http/Controllers/StatsController.php` | acción `stalled` + `stalled` en `exercise` |
| `backend/routes/api.php` | ruta `GET /stats/stalled` |
| `backend/tests/Feature/Api/StatsTest.php` | tests de endpoints |
| `frontend/src/app/core/models/stats.ts` | `StalledExercise`, `ExerciseStats.stalled?` |
| `frontend/src/app/core/api/stats-api.ts` | `stalled()` |
| `frontend/src/app/features/stats/stalled-note.ts` (+ spec) | **nuevo**: `stalledLines`, `STALLED_ALTERNATIVES`, `StalledNote`, `StalledSection` |
| `frontend/src/app/features/stats/stats-page.ts` | sección "Estancados" |
| `frontend/src/app/features/stats/exercise-stats-page.ts` | aviso en el detalle |

---

### Task 1: `StalledExercisesService`

**Files:**
- Create: `backend/app/Services/Stats/StalledExercisesService.php`
- Test: `backend/tests/Unit/Stats/StalledExercisesTest.php`

**Interfaces:**
- Consumes: `SetRow`, `EffectiveLoadResolver::load(SetRow): ?float`, `OneRepMaxCalculator::forSet(SetRow, ?float): ?float`, helper de tests `statsSet(array $overrides): SetRow` (en `tests/Pest.php`).
- Produces: `StalledExercisesService::stalled(Collection $sets, array $active, string $today): array` — `$active` es `array<int, Equipment>` (id => equipamiento); devuelve `list<array{exercise_id:int, name:string, best_e1rm_kg:float, best_date:string, sessions_since:int, deload_kg:?float}>`.

- [ ] **Step 1: Tests (fallan)**

Crear `backend/tests/Unit/Stats/StalledExercisesTest.php`:

```php
<?php

use App\Enums\Equipment;
use App\Enums\SetType;
use App\Services\Stats\EffectiveLoadResolver;
use App\Services\Stats\OneRepMaxCalculator;
use App\Services\Stats\StalledExercisesService;

// Hoy 13/11/2026 → el período empieza el 16/10/2026.
const STALLED_TODAY = '2026-11-13';

function stalledService(): StalledExercisesService
{
    return new StalledExercisesService(new EffectiveLoadResolver, new OneRepMaxCalculator);
}

/** Una sesión (workoutId = fecha) con series [kg, reps, tipo?]. */
function stalledSession(string $date, array $sets, array $extra = []): array
{
    return array_map(fn (array $s) => statsSet([
        'workoutId' => $date.($extra['exerciseId'] ?? 1), 'date' => $date, 'weightKg' => (float) $s[0], 'reps' => $s[1],
        'setType' => $s[2] ?? SetType::Normal, ...$extra,
    ]), $sets);
}

/** @param list<array<int, mixed>> $sessions */
function stalledRun(array $sessions, array $active = [1 => Equipment::Barbell]): array
{
    return stalledService()->stalled(collect(array_merge(...$sessions)), $active, STALLED_TODAY);
}

$plateau = fn () => [
    stalledSession('2026-10-02', [[100, 5]]),
    stalledSession('2026-10-20', [[95, 5]]),
    stalledSession('2026-10-27', [[100, 5]]),
    stalledSession('2026-11-03', [[40, 10, SetType::Warmup], [97.5, 5]]),
];

it('flags an exercise without a new best e1RM in four weeks', function () use ($plateau) {
    expect(stalledRun($plateau()))->toBe([[
        'exercise_id' => 1,
        'name' => 'Press de banca',
        'best_e1rm_kg' => 116.67,
        'best_date' => '2026-10-02',
        'sessions_since' => 3,
        'deload_kg' => 87.5,
    ]]);
});

it('does not flag a new record inside the window', function () use ($plateau) {
    expect(stalledRun([...$plateau(), stalledSession('2026-11-10', [[102.5, 5]])]))->toBe([]);
});

it('needs three sessions in the window', function () {
    expect(stalledRun([
        stalledSession('2026-10-02', [[100, 5]]),
        stalledSession('2026-10-20', [[95, 5]]),
        stalledSession('2026-11-03', [[97.5, 5]]),
    ]))->toBe([]);
});

it('needs history before the window', function () {
    expect(stalledRun([
        stalledSession('2026-10-20', [[100, 5]]),
        stalledSession('2026-10-27', [[95, 5]]),
        stalledSession('2026-11-03', [[97.5, 5]]),
    ]))->toBe([]);
});

it('dates the record the first time it was reached', function () {
    $result = stalledRun([
        stalledSession('2026-09-01', [[100, 5]]),
        stalledSession('2026-10-02', [[100, 5]]),
        stalledSession('2026-10-20', [[95, 5]]),
        stalledSession('2026-10-27', [[95, 5]]),
        stalledSession('2026-11-03', [[95, 5]]),
    ]);

    expect($result[0]['best_date'])->toBe('2026-09-01')
        ->and($result[0]['sessions_since'])->toBe(4);
});

it('ignores sessions without an e1RM', function () use ($plateau) {
    $result = stalledRun([...$plateau(), stalledSession('2026-11-10', [[45, 31, SetType::Bilbo]])]);

    expect($result[0]['sessions_since'])->toBe(3);
});

it('rounds the deload down to the equipment step', function (Equipment $equipment, float $lastKg, float $deload) {
    $result = stalledRun([
        stalledSession('2026-10-02', [[$lastKg + 20, 5]]),
        stalledSession('2026-10-20', [[$lastKg, 5]]),
        stalledSession('2026-10-27', [[$lastKg, 5]]),
        stalledSession('2026-11-03', [[$lastKg, 5]]),
    ], [1 => $equipment]);

    expect($result[0]['deload_kg'])->toBe($deload);
})->with([
    'barra 82,5' => [Equipment::Barbell, 82.5, 72.5],
    'barra 80' => [Equipment::Barbell, 80.0, 70.0],
    'mancuernas 30' => [Equipment::Dumbbell, 30.0, 25.0],
    'máquina 55' => [Equipment::Machine, 55.0, 45.0],
    'kettlebell 24' => [Equipment::Kettlebell, 24.0, 20.0],
]);

it('has no deload weight for bodyweight exercises and bands', function () {
    $sessions = fn (array $extra) => [
        stalledSession('2026-10-02', [[20, 5]], $extra),
        stalledSession('2026-10-20', [[10, 5]], $extra),
        stalledSession('2026-10-27', [[10, 5]], $extra),
        stalledSession('2026-11-03', [[10, 5]], $extra),
    ];

    expect(stalledRun($sessions(['usesBodyweight' => true, 'bodyweightKg' => 80.0]), [1 => Equipment::Bodyweight])[0]['deload_kg'])->toBeNull()
        ->and(stalledRun($sessions([]), [1 => Equipment::Band])[0]['deload_kg'])->toBeNull();
});

it('only looks at active exercises and lists the oldest plateau first', function () use ($plateau) {
    $squat = ['exerciseId' => 2, 'exerciseName' => 'Sentadilla'];
    $row = ['exerciseId' => 3, 'exerciseName' => 'Remo'];
    $sessions = [
        ...$plateau(),
        stalledSession('2026-09-15', [[120, 5]], $squat),
        stalledSession('2026-10-20', [[110, 5]], $squat),
        stalledSession('2026-10-27', [[110, 5]], $squat),
        stalledSession('2026-11-03', [[110, 5]], $squat),
        stalledSession('2026-09-01', [[60, 8]], $row),
        stalledSession('2026-10-20', [[50, 8]], $row),
        stalledSession('2026-10-27', [[50, 8]], $row),
        stalledSession('2026-11-03', [[50, 8]], $row),
    ];

    $result = stalledRun($sessions, [1 => Equipment::Barbell, 2 => Equipment::Barbell]);

    expect(array_column($result, 'name'))->toBe(['Sentadilla', 'Press de banca']);
});
```

Run: `cd backend && ./vendor/bin/pest tests/Unit/Stats/StalledExercisesTest.php`
Expected: FAIL (`Class "App\Services\Stats\StalledExercisesService" not found`).

- [ ] **Step 2: Implementar**

Crear `backend/app/Services/Stats/StalledExercisesService.php`:

```php
<?php

namespace App\Services\Stats;

use App\Enums\Equipment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/** Exercises trained at least 3 times in the last 4 weeks without beating their best estimated 1RM. */
final class StalledExercisesService
{
    public const WINDOW_DAYS = 28;

    public const MIN_SESSIONS = 3;

    public const DELOAD_FACTOR = 0.9;

    public function __construct(
        private readonly EffectiveLoadResolver $loads,
        private readonly OneRepMaxCalculator $oneRepMax,
    ) {}

    /**
     * @param  Collection<int, SetRow>  $sets  every set of the user
     * @param  array<int, Equipment>  $active  active exercises: id => equipment
     * @return list<array{exercise_id: int, name: string, best_e1rm_kg: float, best_date: string, sessions_since: int, deload_kg: ?float}>
     */
    public function stalled(Collection $sets, array $active, string $today): array
    {
        $windowStart = CarbonImmutable::parse($today)->subDays(self::WINDOW_DAYS)->toDateString();

        return $sets
            ->filter(fn (SetRow $set) => isset($active[$set->exerciseId]))
            ->groupBy('exerciseId')
            ->map(fn (Collection $rows, int $id) => $this->evaluate($rows, $active[$id], $windowStart))
            ->filter()
            ->sortBy('best_date')
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, SetRow>  $rows  sets of one exercise, oldest first
     * @return array<string, mixed>|null
     */
    private function evaluate(Collection $rows, Equipment $equipment, string $windowStart): ?array
    {
        $sessions = $rows
            ->groupBy('workoutId')
            ->map(fn (Collection $sets) => [
                'date' => $sets->first()->date,
                'e1rm' => $sets
                    ->map(fn (SetRow $set) => $this->oneRepMax->forSet($set, $this->loads->load($set)))
                    ->filter(fn (?float $value) => $value !== null)
                    ->max(),
                'sets' => $sets,
            ])
            ->filter(fn (array $session) => $session['e1rm'] !== null)
            ->sortBy('date')
            ->values();

        $recent = $sessions->filter(fn (array $session) => $session['date'] >= $windowStart);
        $before = $sessions->filter(fn (array $session) => $session['date'] < $windowStart);
        if ($recent->count() < self::MIN_SESSIONS || $before->isEmpty()) {
            return null;
        }

        $best = $before->max('e1rm');
        if ($recent->max('e1rm') > $best) {
            return null;
        }
        $bestDate = $before->first(fn (array $session) => $session['e1rm'] >= $best)['date'];
        $first = $rows->first();

        return [
            'exercise_id' => $first->exerciseId,
            'name' => $first->exerciseName,
            'best_e1rm_kg' => (float) $best,
            'best_date' => $bestDate,
            'sessions_since' => $sessions->filter(fn (array $session) => $session['date'] > $bestDate)->count(),
            'deload_kg' => $this->deload($sessions->last()['sets'], $equipment),
        ];
    }

    /** @param  Collection<int, SetRow>  $lastSession */
    private function deload(Collection $lastSession, Equipment $equipment): ?float
    {
        $step = match ($equipment) {
            Equipment::Barbell, Equipment::Smith, Equipment::Dumbbell => 2.5,
            Equipment::Machine, Equipment::Cable => 5.0,
            Equipment::Kettlebell => 4.0,
            Equipment::Bodyweight, Equipment::Band => null,
        };
        if ($step === null || $lastSession->first()->usesBodyweight) {
            return null;
        }
        $heaviest = $lastSession->reject(fn (SetRow $set) => $set->isWarmup())->max('weightKg');

        // El épsilon evita que 17,9999… (error de coma flotante) baje un escalón.
        return floor(self::DELOAD_FACTOR * $heaviest / $step + 1e-9) * $step;
    }
}
```

- [ ] **Step 3: Correr los tests**

Run: `cd backend && ./vendor/bin/pest tests/Unit/Stats/StalledExercisesTest.php`
Expected: PASS. Luego `./vendor/bin/pest` (toda la suite) en verde.

- [ ] **Step 4: Commit**

```bash
git add backend/app/Services/Stats/StalledExercisesService.php backend/tests/Unit/Stats/StalledExercisesTest.php
git commit -m "feat(stats): detect stalled exercises with a deload suggestion"
```

---

### Task 2: Endpoints

**Files:**
- Modify: `backend/app/Http/Controllers/StatsController.php`
- Modify: `backend/routes/api.php` (junto a las otras rutas `/stats/*`)
- Test: `backend/tests/Feature/Api/StatsTest.php`

**Interfaces:**
- Consumes: `StalledExercisesService::stalled()` (Task 1); `StatsRequest::today(): CarbonImmutable`.
- Produces: `GET /api/stats/stalled` → `{ data: { period, exercises: StalledExercise[] } }`; `GET /api/stats/exercises/{id}` → `data.stalled: StalledExercise|null`.

- [ ] **Step 1: Tests (fallan)**

Agregar al final de `backend/tests/Feature/Api/StatsTest.php` (hoy en ese archivo = 08/11/2026 en Santiago → el período empieza el 11/10):

```php
function stalledBench(User $user, Exercise $bench): void
{
    $bench->update(['equipment' => App\Enums\Equipment::Barbell]);
    statsWorkout($user, $bench, '2026-10-01', [[100, 5, SetType::Normal]]);
    statsWorkout($user, $bench, '2026-10-15', [[100, 5, SetType::Normal]]);
    statsWorkout($user, $bench, '2026-10-25', [[95, 5, SetType::Normal]]);
    statsWorkout($user, $bench, '2026-11-05', [[97.5, 5, SetType::Normal]]);
}

it('lists the stalled exercises of the user', function () {
    stalledBench($this->user, $this->bench);
    $other = User::factory()->create();
    stalledBench($other, Exercise::factory()->for($other)->create());

    $this->getJson('/api/stats/stalled')
        ->assertOk()
        ->assertJsonCount(1, 'data.exercises')
        ->assertJsonPath('data.exercises.0.name', 'Press de banca')
        ->assertJsonPath('data.exercises.0.best_date', '2026-10-01')
        ->assertJsonPath('data.exercises.0.sessions_since', 3)
        ->assertJsonPath('data.exercises.0.deload_kg', 87.5);
});

it('leaves archived exercises out of the stalled list', function () {
    stalledBench($this->user, $this->bench);
    $this->bench->update(['archived_at' => now()]);

    $this->getJson('/api/stats/stalled')->assertOk()->assertJsonCount(0, 'data.exercises');
});

it('requires a session for the stalled list', function () {
    $this->app['auth']->forgetGuards();

    $this->getJson('/api/stats/stalled')->assertUnauthorized();
});

it('tells whether an exercise is stalled in its stats', function () {
    $this->getJson("/api/stats/exercises/{$this->bench->id}")->assertOk()->assertJsonPath('data.stalled', null);

    stalledBench($this->user, $this->bench);

    $this->getJson("/api/stats/exercises/{$this->bench->id}")
        ->assertOk()
        ->assertJsonPath('data.stalled.best_date', '2026-10-01')
        ->assertJsonPath('data.stalled.deload_kg', 87.5);
});
```

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/StatsTest.php`
Expected: FAIL (404 en `/api/stats/stalled`, falta `data.stalled`).

- [ ] **Step 2: Ruta**

En `backend/routes/api.php`, después de `Route::get('/stats/bodyweight', [StatsController::class, 'bodyweight']);` agregar:

```php
    Route::get('/stats/stalled', [StatsController::class, 'stalled']);
```

- [ ] **Step 3: Controlador**

En `backend/app/Http/Controllers/StatsController.php`:

- Agregar `use App\Services\Stats\StalledExercisesService;` junto a los otros `use`.
- Reemplazar la acción `exercise` por:

```php
    public function exercise(StatsRequest $request, Exercise $exercise, ExerciseProgressService $progress, StalledExercisesService $stalled): JsonResponse
    {
        $sets = $this->data->sets($exercise->id);
        $active = $exercise->archived_at === null ? [$exercise->id => $exercise->equipment] : [];

        return $this->respond($request, [
            'exercise' => ['id' => $exercise->id, 'name' => $exercise->name, 'uses_bodyweight' => $exercise->uses_bodyweight],
            ...$progress->progress($sets, $request->from()),
            'stalled' => $stalled->stalled($sets, $active, $request->today()->toDateString())[0] ?? null,
        ]);
    }

    public function stalled(StatsRequest $request, StalledExercisesService $stalled): JsonResponse
    {
        $active = Exercise::query()
            ->whereNull('archived_at')
            ->get(['id', 'equipment'])
            ->mapWithKeys(fn (Exercise $exercise) => [$exercise->id => $exercise->equipment])
            ->all();

        return $this->respond($request, [
            'exercises' => $stalled->stalled($this->data->sets(), $active, $request->today()->toDateString()),
        ]);
    }
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS (toda la suite).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/StatsController.php backend/routes/api.php backend/tests/Feature/Api/StatsTest.php
git commit -m "feat(stats): stalled exercises endpoint and flag in exercise stats"
```

---

### Task 3: Interfaz — sección "Estancados" y aviso en el detalle

**Files:**
- Modify: `frontend/src/app/core/models/stats.ts`
- Modify: `frontend/src/app/core/api/stats-api.ts`
- Create: `frontend/src/app/features/stats/stalled-note.ts`
- Test: `frontend/src/app/features/stats/stalled-note.spec.ts`
- Modify: `frontend/src/app/features/stats/stats-page.ts`
- Modify: `frontend/src/app/features/stats/exercise-stats-page.ts`

**Interfaces:**
- Consumes: `GET /api/stats/stalled`, `data.stalled` del detalle (Task 2).
- Produces: `interface StalledExercise`; `StatsApi.stalled(): Promise<StalledExercise[]>`; `stalledLines(item): { since: string; deload: string }`; `STALLED_ALTERNATIVES: string`; componentes `StalledNote` (`app-stalled-note`, input `item`) y `StalledSection` (`app-stalled-section`, input `items`).

- [ ] **Step 1: Modelo y API**

En `frontend/src/app/core/models/stats.ts`, agregar antes de `export interface ExerciseStats`:

```ts
export interface StalledExercise {
  exercise_id: number;
  name: string;
  best_e1rm_kg: number;
  /** Primera vez que se alcanzó el récord (fecha local). */
  best_date: string;
  sessions_since: number;
  /** null en peso corporal y bandas. */
  deload_kg: number | null;
}
```

y dentro de `ExerciseStats`, después de `records: PersonalRecords;`:

```ts
  /** Falta en respuestas guardadas en caché antes del 2026-11-13. */
  stalled?: StalledExercise | null;
```

En `frontend/src/app/core/api/stats-api.ts`, agregar `StalledExercise` al `import type` y este método después de `bodyweight`:

```ts
  async stalled(): Promise<StalledExercise[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: { exercises: StalledExercise[] } }>('/api/stats/stalled'),
    );
    return response.data.exercises;
  }
```

- [ ] **Step 2: Tests de los componentes (fallan)**

Crear `frontend/src/app/features/stats/stalled-note.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import type { StalledExercise } from '../../core/models/stats';
import { STALLED_ALTERNATIVES, StalledSection, stalledLines } from './stalled-note';

const bench: StalledExercise = {
  exercise_id: 7, name: 'Press de banca', best_e1rm_kg: 116.67, best_date: '2026-10-02', sessions_since: 4, deload_kg: 72.5,
};
const pullUps: StalledExercise = { ...bench, exercise_id: 8, name: 'Dominadas', deload_kg: null };

async function renderSection(items: StalledExercise[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(StalledSection);
  fixture.componentRef.setInput('items', items);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('stalledLines', () => {
  it('describes the plateau and a concrete deload', () => {
    expect(stalledLines(bench)).toEqual({
      since: 'Sin récord desde 02/10/2026 · 4 sesiones',
      deload: 'Descarga: una semana con 72,5 kg',
    });
  });

  it('suggests a deload without a weight for bodyweight exercises', () => {
    expect(stalledLines(pullUps).deload).toBe('Descarga: una semana sin lastre o con 2 reps menos por serie');
  });
});

describe('StalledSection', () => {
  it('lists each stalled exercise linking to its stats, with the alternatives once', async () => {
    const el = await renderSection([bench, pullUps]);

    expect(el.querySelector('h2')!.textContent).toContain('Estancados');
    const links = Array.from(el.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/estadisticas/ejercicios/7', '/estadisticas/ejercicios/8']);
    expect(links[0].textContent).toContain('Press de banca');
    expect(links[0].textContent).toContain('Descarga: una semana con 72,5 kg');
    expect(el.textContent!.split(STALLED_ALTERNATIVES)).toHaveLength(2);
  });

  it('renders nothing without stalled exercises', async () => {
    const el = await renderSection([]);
    expect(el.textContent!.trim()).toBe('');
  });
});
```

Run: `cd frontend && npx ng test --watch=false --include=src/app/features/stats/stalled-note.spec.ts`
Expected: FAIL (no existe `./stalled-note`).

- [ ] **Step 3: Componentes**

Crear `frontend/src/app/features/stats/stalled-note.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight } from '@ng-icons/lucide';
import { formatDate, formatKg } from '../../core/format/format';
import type { StalledExercise } from '../../core/models/stats';

export const STALLED_ALTERNATIVES =
  'Si sigue igual: cambia el rango de reps, descansa más entre series o prueba una variante.';

export function stalledLines(item: StalledExercise): { since: string; deload: string } {
  return {
    since: `Sin récord desde ${formatDate(item.best_date)} · ${item.sessions_since} sesiones`,
    deload:
      item.deload_kg === null
        ? 'Descarga: una semana sin lastre o con 2 reps menos por serie'
        : `Descarga: una semana con ${formatKg(item.deload_kg)}`,
  };
}

/** Las dos líneas de un ejercicio estancado (desde cuándo y qué descarga hacer). */
@Component({
  selector: 'app-stalled-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lines();
    <p class="num text-base text-muted-foreground">{{ l.since }}</p>
    <p class="text-sm font-semibold text-primary">{{ l.deload }}</p>
  `,
})
export class StalledNote {
  readonly item = input.required<StalledExercise>();
  protected readonly lines = computed(() => stalledLines(this.item()));
}

/** Sección "Estancados" de Estadísticas: no dibuja nada si la lista está vacía. */
@Component({
  selector: 'app-stalled-section',
  imports: [RouterLink, NgIcon, StalledNote],
  providers: [provideIcons({ lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section class="mb-6">
        <h2 class="section-title mb-3">Estancados</h2>
        <ul class="flex flex-col gap-2">
          @for (s of items(); track s.exercise_id) {
            <li>
              <a [routerLink]="['/estadisticas/ejercicios', s.exercise_id]" class="card flex items-center gap-3 p-4">
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{{ s.name }}</p>
                  <app-stalled-note [item]="s" />
                </div>
                <ng-icon name="lucideChevronRight" size="20" class="text-muted-foreground" />
              </a>
            </li>
          }
        </ul>
        <p class="mt-2 text-sm text-muted-foreground">{{ alternatives }}</p>
      </section>
    }
  `,
})
export class StalledSection {
  readonly items = input.required<StalledExercise[]>();
  protected readonly alternatives = STALLED_ALTERNATIVES;
}
```

Run: `cd frontend && npx ng test --watch=false --include=src/app/features/stats/stalled-note.spec.ts`
Expected: PASS.

- [ ] **Step 4: Sección en Estadísticas**

En `frontend/src/app/features/stats/stats-page.ts`:

- Import: `import { StalledSection } from './stalled-note';` y agregar `StalledSection` al arreglo `imports` del componente.
- En la clase, después del recurso `bodyweight`:

```ts
  /** Sin período: siempre mira las últimas 4 semanas. */
  protected readonly stalled = resource({
    loader: () => cachedFetch(this.db, 'stats:stalled', () => this.api.stalled()),
  });
```

- En la plantilla, justo antes de `    <section class="card mb-6 p-4">\n      <h2 class="section-title mb-1">Constancia</h2>` insertar:

```html
    @if (!stalled.error() && stalled.value(); as list) {
      <app-stalled-section [items]="list" />
    }
```

- [ ] **Step 5: Aviso en el detalle**

En `frontend/src/app/features/stats/exercise-stats-page.ts`:

- Import: `import { STALLED_ALTERNATIVES, StalledNote } from './stalled-note';` y agregar `StalledNote` a `imports`.
- En la clase: `protected readonly stalledAlternatives = STALLED_ALTERNATIVES;`
- En la plantilla, dentro de `@if (stats.value(); as s) {` y justo antes de `      <div class="mb-6 grid grid-cols-2 gap-2">`, insertar:

```html
      @if (s.stalled; as stalled) {
        <div class="card mb-4 border-primary/40 p-4" role="status">
          <p class="font-semibold text-primary">Estancado</p>
          <app-stalled-note [item]="stalled" />
          <p class="mt-1 text-sm text-muted-foreground">{{ stalledAlternatives }}</p>
        </div>
      }
```

- [ ] **Step 6: Tests y build**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS (toda la suite; si falla un spec no tocado por timeout, correrlo solo para confirmar).

Run: `cd frontend && npx ng build`
Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/models/stats.ts frontend/src/app/core/api/stats-api.ts \
  frontend/src/app/features/stats/stalled-note.ts frontend/src/app/features/stats/stalled-note.spec.ts \
  frontend/src/app/features/stats/stats-page.ts frontend/src/app/features/stats/exercise-stats-page.ts
git commit -m "feat(stats): stalled section in stats and notice in exercise stats"
```

---

## Revisión de Luciano (después de las tareas)

- `docker compose up -d` + `cd frontend && npm start`; entrar con `luciano@gymtracker.test` / `password`.
- Para ver la sección hace falta historial local que cumpla la regla: cargar sesiones de prueba (≥1 antes del 16/10 con un récord y ≥3 después sin superarlo) en la BD local, igual que con las sugerencias de progresión.
- Revisar: sección "Estancados" (texto, enlace al detalle), aviso en el detalle, que no aparezca nada sin estancados.
- Con su OK: "intégralo a main".
