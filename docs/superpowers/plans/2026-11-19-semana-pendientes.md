# Hoy sabe lo que te falta esta semana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Hoy sugiera el día pendiente de la semana cuando el de hoy ya se hizo en otra fecha, y mostrar una franja L–D con lo hecho y lo pendiente.

**Architecture:** `App\Services\TodaySuggestion` calcula los días de la rutina activa hechos esta semana (lunes a domingo, Santiago) y decide qué día mostrar; `TodayController` solo formatea y agrega `suggestion`, `replaced` y `week` a la respuesta. En el frontend, un componente `WeekStrip` y ajustes de textos en `TodayPage`.

**Tech Stack:** Laravel 13 + Pest, Angular 22 standalone/zoneless + Signals + Vitest.

Spec: `docs/superpowers/specs/2026-11-19-semana-pendientes-design.md`.

## Global Constraints

- Rama `semana-pendientes`. Código en inglés; UI en español (Chile).
- Semana = lunes a domingo en `America/Santiago`. Filtro de fechas: `date >= lunes` y `date < lunes siguiente` (SQLite guarda `Y-m-d 00:00:00`).
- Día hecho = workout con `routine_day_id` de un día de la rutina activa en la semana (terminado o no). Pendiente = día con `weekday` no hecho. Días sin `weekday` no cuentan.
- `suggestion`: `'planned' | 'chosen' | 'pending' | 'week_done' | null`. `replaced`: `{ id, name, weekday, done_on }` o `null`. `week`: `{ start, done_day_ids }`.
- En el tipo `Today` del frontend los tres campos son opcionales.
- Comandos: `cd backend && ./vendor/bin/pest`, `./vendor/bin/pint`; `cd frontend && npx ng test --watch=false`, `npx ng build`.
- No encadenar tests con `git commit` a través de un pipe; mirar el resultado y luego hacer el commit.

---

### Task 1: Sugerencia según la semana (backend)

**Files:**
- Create: `backend/app/Services/TodaySuggestion.php`
- Modify: `backend/app/Http/Controllers/TodayController.php` (reemplazo completo)
- Test: `backend/tests/Feature/Api/TodayWeekTest.php`

**Interfaces:**
- Produces: `TodaySuggestion::for(?Routine $routine, CarbonInterface $now, ?int $requestedDayId = null): array{day: ?RoutineDay, suggestion: ?string, replaced: ?array, week: array{start: string, done_day_ids: list<int>}}`; en `GET /api/today`: `data.suggestion`, `data.replaced`, `data.week`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/Feature/Api/TodayWeekTest.php`:

```php
<?php

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\User;
use App\Models\Workout;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->routine = Routine::factory()->for($this->user)->create(['is_active' => true]);
    $this->mon = RoutineDay::factory()->for($this->routine)->create(['name' => 'Pecho', 'weekday' => 1, 'position' => 0]);
    $this->wed = RoutineDay::factory()->for($this->routine)->create(['name' => 'Espalda', 'weekday' => 3, 'position' => 1]);
    $this->thu = RoutineDay::factory()->for($this->routine)->create(['name' => 'Piernas', 'weekday' => 4, 'position' => 2]);
    RoutineDay::factory()->for($this->routine)->create(['name' => 'Extra', 'weekday' => null, 'position' => 3]);
    // Jueves 2026-11-05 al mediodía en Santiago (semana del lunes 2026-11-02).
    $this->travelTo(Carbon::parse('2026-11-05 15:00:00', 'UTC'));
});

function trainedOn(string $date, ?RoutineDay $day = null): void
{
    Workout::factory()->for(test()->user)->create(['date' => $date, 'routine_day_id' => $day?->id]);
}

it('reports the routine days done this week', function () {
    trainedOn('2026-11-02', $this->mon);
    trainedOn('2026-10-29', $this->thu); // semana anterior
    trainedOn('2026-11-03'); // sesión libre
    trainedOn('2026-11-03', RoutineDay::factory()->for(Routine::factory()->for($this->user))->create()); // otra rutina

    $this->getJson('/api/today')
        ->assertOk()
        ->assertJsonPath('data.week.start', '2026-11-02')
        ->assertJsonPath('data.week.done_day_ids', [$this->mon->id])
        ->assertJsonPath('data.suggestion', 'planned')
        ->assertJsonPath('data.day.name', 'Piernas')
        ->assertJsonPath('data.replaced', null);
});

it('counts the whole week up to sunday', function () {
    $this->travelTo(Carbon::parse('2026-11-08 15:00:00', 'UTC')); // domingo
    trainedOn('2026-11-08', $this->thu);

    $this->getJson('/api/today')
        ->assertJsonPath('data.week.start', '2026-11-02')
        ->assertJsonPath('data.week.done_day_ids', [$this->thu->id]);
});

it('suggests the pending day when today\'s was done earlier this week', function () {
    trainedOn('2026-11-02', $this->mon);
    trainedOn('2026-11-04', $this->thu);

    $this->getJson('/api/today')
        ->assertJsonPath('data.suggestion', 'pending')
        ->assertJsonPath('data.day.name', 'Espalda')
        ->assertJsonPath('data.replaced.id', $this->thu->id)
        ->assertJsonPath('data.replaced.name', 'Piernas')
        ->assertJsonPath('data.replaced.done_on', '2026-11-04');
});

it('suggests the earliest pending day first', function () {
    trainedOn('2026-11-04', $this->thu);

    $this->getJson('/api/today')->assertJsonPath('data.day.name', 'Pecho');
});

it('keeps today\'s day when it was trained today', function () {
    trainedOn('2026-11-05', $this->thu);

    $this->getJson('/api/today')
        ->assertJsonPath('data.suggestion', 'planned')
        ->assertJsonPath('data.day.name', 'Piernas')
        ->assertJsonPath('data.replaced', null);
});

it('reports a complete week', function () {
    trainedOn('2026-11-02', $this->mon);
    trainedOn('2026-11-03', $this->wed);
    trainedOn('2026-11-04', $this->thu);

    $this->getJson('/api/today')
        ->assertJsonPath('data.suggestion', 'week_done')
        ->assertJsonPath('data.day', null)
        ->assertJsonPath('data.replaced.name', 'Piernas');
});

it('marks a chosen day as chosen', function () {
    $this->getJson("/api/today?day={$this->wed->id}")
        ->assertJsonPath('data.suggestion', 'chosen')
        ->assertJsonPath('data.day.name', 'Espalda');
});

it('has no suggestion on a rest day', function () {
    $this->travelTo(Carbon::parse('2026-11-03 15:00:00', 'UTC')); // martes

    $this->getJson('/api/today')
        ->assertJsonPath('data.suggestion', null)
        ->assertJsonPath('data.day', null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/TodayWeekTest.php`
Expected: FAIL (`data.week` / `data.suggestion` no existen).

- [ ] **Step 3: Create the service**

`backend/app/Services/TodaySuggestion.php`:

```php
<?php

namespace App\Services;

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\Workout;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/** Qué día mostrar en Hoy según lo entrenado esta semana (lunes a domingo). */
class TodaySuggestion
{
    /**
     * @return array{day: ?RoutineDay, suggestion: ?string, replaced: ?array, week: array{start: string, done_day_ids: list<int>}}
     */
    public function for(?Routine $routine, CarbonInterface $now, ?int $requestedDayId = null): array
    {
        $start = $now->copy()->startOfWeek(CarbonInterface::MONDAY);
        $done = $routine ? $this->doneDates($routine, $start) : collect();
        $result = [
            'day' => null,
            'suggestion' => null,
            'replaced' => null,
            'week' => [
                'start' => $start->toDateString(),
                'done_day_ids' => $done->keys()->map(fn ($id) => (int) $id)->values()->all(),
            ],
        ];

        // ?day=ID: el día pedido manda (el controlador responde 404 si no existe).
        if ($requestedDayId !== null) {
            $day = $routine?->days->firstWhere('id', $requestedDayId);

            return [...$result, 'day' => $day, 'suggestion' => $day ? 'chosen' : null];
        }

        $planned = $routine?->days->firstWhere('weekday', $now->dayOfWeekIso);
        if (! $planned) {
            return $result;
        }

        $dates = $done->get($planned->id, []);
        if ($dates === [] || in_array($now->toDateString(), $dates, true)) {
            return [...$result, 'day' => $planned, 'suggestion' => 'planned'];
        }

        // El de hoy ya se hizo otro día: primero los pendientes atrasados (menor weekday).
        $pending = $routine->days
            ->filter(fn (RoutineDay $day) => $day->weekday !== null && ! $done->has($day->id))
            ->sortBy('weekday')
            ->first();

        return [
            ...$result,
            'day' => $pending,
            'suggestion' => $pending ? 'pending' : 'week_done',
            'replaced' => [
                'id' => $planned->id,
                'name' => $planned->name,
                'weekday' => $planned->weekday,
                'done_on' => $dates[0],
            ],
        ];
    }

    /** @return Collection<int, list<string>> routine_day_id => fechas (Y-m-d, ascendentes) de esta semana. */
    private function doneDates(Routine $routine, CarbonInterface $start): Collection
    {
        return Workout::query()
            ->whereIn('routine_day_id', $routine->days->pluck('id'))
            ->where('date', '>=', $start->toDateString())
            ->where('date', '<', $start->copy()->addWeek()->toDateString())
            ->orderBy('date')
            ->get(['routine_day_id', 'date'])
            ->groupBy('routine_day_id')
            ->map(fn (Collection $workouts) => $workouts
                ->map(fn (Workout $workout) => $workout->date->toDateString())
                ->unique()
                ->values()
                ->all());
    }
}
```

- [ ] **Step 4: Use it in the controller**

Reemplazar `backend/app/Http/Controllers/TodayController.php` completo:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Resources\ExerciseSessionResource;
use App\Http\Resources\RoutineDayExerciseResource;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Services\LastPerformanceService;
use App\Services\TodaySuggestion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TodayController extends Controller
{
    public function __invoke(Request $request, LastPerformanceService $lastPerformance, TodaySuggestion $suggestions): JsonResponse
    {
        $now = now(config('app.user_timezone'));
        $routine = Routine::query()->where('is_active', true)->with('days')->first();
        // ?day=ID: hacer hoy otro día de la rutina activa, sin cambiar la rutina.
        $requested = $request->integer('day') ?: null;
        $result = $suggestions->for($routine, $now, $requested);
        if ($requested && ! $result['day']) {
            abort(404);
        }
        $day = $result['day'];

        return response()->json(['data' => [
            'date' => $now->toDateString(),
            'weekday' => $now->dayOfWeekIso,
            'routine' => $routine ? ['id' => $routine->id, 'name' => $routine->name] : null,
            'day' => $day ? $this->dayWithLastPerformance($day, $lastPerformance) : null,
            'days' => $routine
                ? $routine->days->map(fn (RoutineDay $d) => ['id' => $d->id, 'name' => $d->name, 'weekday' => $d->weekday])->values()
                : [],
            'suggestion' => $result['suggestion'],
            'replaced' => $result['replaced'],
            'week' => $result['week'],
        ]]);
    }

    private function dayWithLastPerformance(RoutineDay $day, LastPerformanceService $lastPerformance): array
    {
        $day->load('exercises.exercise');
        $last = $lastPerformance->forExercises($day->exercises->pluck('exercise_id')->unique()->values()->all());

        return [
            'id' => $day->id,
            'routine_id' => $day->routine_id,
            'name' => $day->name,
            'weekday' => $day->weekday,
            'position' => $day->position,
            'exercises' => $day->exercises->map(fn (RoutineDayExercise $item) => [
                ...(new RoutineDayExerciseResource($item))->resolve(),
                'last_performance' => isset($last[$item->exercise_id])
                    ? (new ExerciseSessionResource($last[$item->exercise_id]))->resolve()
                    : null,
            ])->values(),
        ];
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/TodayWeekTest.php tests/Feature/Api/TodayTest.php`
Expected: PASS. Luego `./vendor/bin/pint` y la suite completa.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Services/TodaySuggestion.php backend/app/Http/Controllers/TodayController.php backend/tests/Feature/Api/TodayWeekTest.php
git commit -m "feat(today): suggest the pending day when today's was already done this week"
```

---

### Task 2: Franja semanal y textos en Hoy (frontend)

**Files:**
- Modify: `frontend/src/app/core/models/routine.ts` (interfaz `Today`)
- Create: `frontend/src/app/features/today/week-strip.ts`
- Modify: `frontend/src/app/features/today/today-page.ts`
- Test: `frontend/src/app/features/today/today-page.spec.ts`

**Interfaces:**
- Consumes: `data.suggestion`, `data.replaced`, `data.week` (Task 1).
- Produces: `type TodaySuggestion`; `<app-week-strip [today]>` con celdas `[data-state="done|pending|rest"]`.

- [ ] **Step 1: Write the failing tests** (al final del `describe` de `today-page.spec.ts`; usa la constante `twoDays` que ya existe)

```ts
  it('shows the week with done and pending days', async () => {
    const { el, text } = await render({ ...twoDays, weekday: 4, week: { start: '2026-11-02', done_day_ids: [10] } });
    expect(el.querySelectorAll('app-week-strip [data-state="done"]')).toHaveLength(1);
    expect(el.querySelectorAll('app-week-strip [data-state="pending"]')).toHaveLength(1);
    expect(el.querySelectorAll('app-week-strip [data-state="rest"]')).toHaveLength(5);
    expect(text).toContain('1 de 2 días esta semana');
  });

  it('suggests the day still pending this week', async () => {
    const { text } = await render({
      ...twoDays,
      weekday: 4,
      suggestion: 'pending',
      replaced: { id: 11, name: 'Jueves – Piernas', weekday: 4, done_on: '2026-11-04' },
      week: { start: '2026-11-02', done_day_ids: [11] },
    });
    expect(text).toContain('Te falta esta semana');
    expect(text).toContain('Jueves – Piernas ya lo hiciste el miércoles.');
    expect(text).not.toContain('Te toca hoy');
  });

  it('celebrates a complete week', async () => {
    const { text } = await render({
      ...twoDays,
      weekday: 4,
      day: null,
      suggestion: 'week_done',
      replaced: { id: 11, name: 'Jueves – Piernas', weekday: 4, done_on: '2026-11-04' },
      week: { start: '2026-11-02', done_day_ids: [10, 11] },
    });
    expect(text).toContain('¡Semana completa!');
    expect(text).toContain('Ya hiciste los 2 días de tu rutina');
    expect(text).not.toContain('Hoy es día de descanso');
  });

  it('marks the days done this week in the list', async () => {
    const { el } = await render({ ...twoDays, week: { start: '2026-11-02', done_day_ids: [11] } });
    expect(el.querySelector('a[href="/hoy?dia=11"]')?.textContent).toContain('Hecho');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/today/today-page.spec.ts`
Expected: FAIL (error de tipos: `week`/`suggestion` no existen en `Today`).

- [ ] **Step 3: Extend the `Today` type**

En `frontend/src/app/core/models/routine.ts`, antes de `export interface Today {` agregar:

```ts
export type TodaySuggestion = 'planned' | 'chosen' | 'pending' | 'week_done';
```

y dentro de `Today`, después de `days: Pick<RoutineDay, 'id' | 'name' | 'weekday'>[];`:

```ts
  /** Opcionales: un "Hoy" guardado en el dispositivo antes de la franja semanal no los trae. */
  suggestion?: TodaySuggestion | null;
  replaced?: (Pick<RoutineDay, 'id' | 'name' | 'weekday'> & { done_on: string }) | null;
  week?: { start: string; done_day_ids: number[] };
```

- [ ] **Step 4: Create the strip**

`frontend/src/app/features/today/week-strip.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import { WEEKDAYS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { Today } from '../../core/models/routine';

type CellState = 'done' | 'pending' | 'rest';

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const STATE_LABELS: Record<CellState, string> = { done: 'hecho', pending: 'pendiente', rest: 'descanso' };

/** L M M J V S D: qué días de la rutina ya se entrenaron esta semana. */
@Component({
  selector: 'app-week-strip',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <section class="mb-5" aria-label="Esta semana">
        <ol class="flex justify-between gap-1">
          @for (cell of cells(); track cell.weekday) {
            <li
              class="flex flex-1 flex-col items-center gap-1.5"
              [attr.data-state]="cell.state"
              [attr.aria-label]="cell.label"
            >
              <span
                class="text-xs font-semibold"
                [class.text-primary]="cell.today"
                [class.text-muted-foreground]="!cell.today"
                aria-hidden="true"
                >{{ cell.letter }}</span
              >
              @switch (cell.state) {
                @case ('done') {
                  <span class="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <ng-icon name="lucideCheck" size="16" aria-hidden="true" />
                  </span>
                }
                @case ('pending') {
                  <span class="size-8 rounded-full border-2 border-primary/50"></span>
                }
                @default {
                  <span class="flex size-8 items-center justify-center">
                    <span class="size-1.5 rounded-full bg-muted-foreground/40"></span>
                  </span>
                }
              }
            </li>
          }
        </ol>
        <p class="mt-2 text-center text-sm text-muted-foreground">{{ done() }} de {{ total() }} días esta semana</p>
      </section>
    }
  `,
})
export class WeekStrip {
  readonly today = input.required<Today>();

  protected readonly cells = computed(() => {
    const t = this.today();
    const done = new Set(t.week?.done_day_ids ?? []);
    return WEEKDAYS.map((weekday, i) => {
      const day = t.days.find((d) => d.weekday === weekday);
      const state: CellState = !day ? 'rest' : done.has(day.id) ? 'done' : 'pending';
      return {
        weekday,
        letter: LETTERS[i],
        today: weekday === t.weekday,
        state,
        label: `${WEEKDAY_LABELS[weekday]}: ${STATE_LABELS[state]}`,
      };
    });
  });
  protected readonly total = computed(() => this.cells().filter((c) => c.state !== 'rest').length);
  protected readonly done = computed(() => this.cells().filter((c) => c.state === 'done').length);
}
```

- [ ] **Step 5: Update `TodayPage`**

En `frontend/src/app/features/today/today-page.ts`:

1. Imports: agregar `lucideCheck` y `lucideTrophy` al import de `@ng-icons/lucide` y a `provideIcons({...})`; agregar `import { WeekStrip } from './week-strip';` y `WeekStrip` al arreglo `imports` del componente.

2. Template — después de `<app-health-prompt-card [today]="t.date" />`:

```html
      @if (t.routine) {
        <app-week-strip [today]="t" />
      }
```

3. Template — reemplazar la expresión de la etiqueta de la tarjeta
`{{ sessions.activeId() ? 'Entrenamiento en curso' : chosenDay() ? 'Elegiste para hoy' : 'Te toca hoy' }}` por `{{ heroLabel(t) }}`.

4. Template — justo después del bloque `@if (chosenDay()) { <a routerLink="/hoy" …>← Volver a lo de hoy</a> }` que está antes de la tarjeta:

```html
        @if (!chosenDay() && t.suggestion === 'pending' && t.replaced; as replaced) {
          <p class="mb-3 text-sm text-muted-foreground">{{ replaced.name }} ya lo hiciste el {{ weekdayOfDate(replaced.done_on) }}.</p>
        }
```

5. Template — en la tarjeta de descanso, reemplazar:

```html
          <span class="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ng-icon name="lucideMoon" size="22" aria-hidden="true" />
          </span>
          <h2 class="section-title text-2xl">Hoy es día de descanso</h2>
          <p class="mt-1 text-sm text-muted-foreground">Recuperar también es entrenar. Si igual quieres moverte:</p>
```

por:

```html
          <span class="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ng-icon [name]="t.suggestion === 'week_done' ? 'lucideTrophy' : 'lucideMoon'" size="22" aria-hidden="true" />
          </span>
          @if (t.suggestion === 'week_done') {
            <h2 class="section-title text-2xl">¡Semana completa!</h2>
            <p class="mt-1 text-sm text-muted-foreground">Ya hiciste los {{ weekTotal(t) }} días de tu rutina. Si igual quieres moverte:</p>
          } @else {
            <h2 class="section-title text-2xl">Hoy es día de descanso</h2>
            <p class="mt-1 text-sm text-muted-foreground">Recuperar también es entrenar. Si igual quieres moverte:</p>
          }
```

6. Template — en los dos usos de `dayLink`, cambiar el contexto a
`context: { $implicit: d, done: isDone(t, d.id) }`; y en el `<ng-template #dayLink let-d>` cambiar la apertura a `<ng-template #dayLink let-d let-done="done">` y, después del `</div>` que cierra nombre y día de la semana (antes del `<ng-icon name="lucideChevronRight" …>`), agregar:

```html
          @if (done) {
            <span class="flex items-center gap-1 text-sm font-semibold text-primary">
              <ng-icon name="lucideCheck" size="16" aria-hidden="true" />Hecho
            </span>
          }
```

7. Clase — agregar métodos:

```ts
  protected heroLabel(t: Today): string {
    if (this.sessions.activeId()) return 'Entrenamiento en curso';
    if (this.chosenDay()) return 'Elegiste para hoy';
    return t.suggestion === 'pending' ? 'Te falta esta semana' : 'Te toca hoy';
  }

  /** "2026-11-04" → "miércoles". */
  protected weekdayOfDate(date: string): string {
    const day = new Date(`${date}T12:00:00`).getDay(); // 0 = domingo
    return WEEKDAY_LABELS[day === 0 ? 7 : day].toLowerCase();
  }

  protected weekTotal(t: Today): number {
    return t.days.filter((d) => d.weekday !== null).length;
  }

  protected isDone(t: Today, dayId: number): boolean {
    return t.week?.done_day_ids.includes(dayId) ?? false;
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/today/today-page.spec.ts`
Expected: PASS. Luego la suite completa y `npx ng build`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/models/routine.ts frontend/src/app/features/today/
git commit -m "feat(today): week strip, pending-day suggestion and complete-week card"
```

---

### Task 3: Verificación y despliegue

- [ ] **Step 1:** Suites completas en verde (backend y frontend).
- [ ] **Step 2:** E2E local con curl: crear un workout del día del jueves con fecha de ayer (miércoles) y ver que `GET /api/today` devuelve `suggestion: pending` y el día pendiente; borrar ese workout de prueba al terminar.
- [ ] **Step 3:** Con su "despliégalo": `git push . HEAD:main`, `git checkout main`, `git push origin main`, vigilar el deploy y verificar en prod.
