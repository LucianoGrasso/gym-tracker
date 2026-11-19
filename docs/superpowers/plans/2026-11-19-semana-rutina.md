# Semana de la rutina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar los días de entrenamiento de la rutina arrastrándolos en un tablero de 7 días, y poder entrenar hoy cualquier otro día de la rutina sin modificarla.

**Architecture:** Un endpoint `PUT /api/routines/{routine}/schedule` reasigna `weekday` y `position` de todos los días en una transacción. En el frontend, una función pura (`core/routine/schedule.ts`) calcula el nuevo orden al soltar, y `WeeklyBoard` (8 listas CDK conectadas: 7 días + bandeja) la usa. `GET /api/today?day={id}` devuelve el día elegido; la página Hoy lo lee de `?dia=` en la URL.

**Tech Stack:** Laravel 13 + Pest (backend), Angular 22 standalone/zoneless + Signals + Angular CDK drag-drop + Vitest (frontend).

Spec: `docs/superpowers/specs/2026-11-19-semana-rutina-design.md`.

## Global Constraints

- Rama `semana-rutina`. Código en inglés; textos de UI en español (Chile).
- `weekday`: `null` o 1–7 (1 = lunes … 7 = domingo); sin repetidos dentro de una rutina (los `null` no cuentan).
- `schedule` exige todos los días de la rutina, cada uno una vez; el índice en el arreglo es la nueva `position`.
- Mensajes 422: "Hay dos días asignados al mismo día de la semana." / "Faltan días de la rutina."
- Validación en Form Requests. Rutina ajena → 404 (scope `BelongsToUser` en el binding), igual que el resto de `/api/routines/{routine}`.
- Hoy: día elegido en la URL `/hoy?dia={id}`; caché local `today:day:{id}`; el normal sigue en `today`.
- Comandos: backend `cd backend && ./vendor/bin/pest`; frontend `cd frontend && npx ng test --watch=false`; Pint `cd backend && ./vendor/bin/pint`.
- No encadenar `pest | tail && git commit` (el pipe oculta el código de salida): correr los tests, mirar el resultado y recién ahí hacer el commit.

---

### Task 1: Endpoint `schedule` (backend)

**Files:**
- Create: `backend/app/Http/Requests/RoutineScheduleRequest.php`
- Modify: `backend/app/Http/Controllers/RoutineDayController.php` (método nuevo `schedule`)
- Modify: `backend/routes/api.php` (grupo `can:manage,routine`)
- Test: `backend/tests/Feature/Api/RoutineScheduleTest.php`

**Interfaces:**
- Produces: `PUT /api/routines/{routine}/schedule` con body `{ days: [{ id: int, weekday: int|null }] }` → 204.

- [ ] **Step 1: Write the failing tests**

`backend/tests/Feature/Api/RoutineScheduleTest.php`:

```php
<?php

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->routine = Routine::factory()->for($this->user)->create();
    $this->wed = RoutineDay::factory()->for($this->routine)->create(['name' => 'Pecho', 'weekday' => 3, 'position' => 0]);
    $this->thu = RoutineDay::factory()->for($this->routine)->create(['name' => 'Piernas', 'weekday' => 4, 'position' => 1]);
    $this->extra = RoutineDay::factory()->for($this->routine)->create(['name' => 'Extra', 'weekday' => null, 'position' => 2]);
});

function putSchedule(Routine $routine, array $days)
{
    return test()->putJson("/api/routines/{$routine->id}/schedule", ['days' => $days]);
}

it('swaps two days and stores the order as position', function () {
    putSchedule($this->routine, [
        ['id' => $this->thu->id, 'weekday' => 3],
        ['id' => $this->wed->id, 'weekday' => 4],
        ['id' => $this->extra->id, 'weekday' => null],
    ])->assertNoContent();

    expect($this->thu->fresh())->weekday->toBe(3)->position->toBe(0)
        ->and($this->wed->fresh())->weekday->toBe(4)->position->toBe(1)
        ->and($this->extra->fresh())->weekday->toBeNull()->position->toBe(2);
});

it('moves a day to the tray and another to a free weekday', function () {
    putSchedule($this->routine, [
        ['id' => $this->extra->id, 'weekday' => 1],
        ['id' => $this->thu->id, 'weekday' => 4],
        ['id' => $this->wed->id, 'weekday' => null],
    ])->assertNoContent();

    expect($this->extra->fresh()->weekday)->toBe(1)
        ->and($this->wed->fresh())->weekday->toBeNull()->position->toBe(2);
});

it('rejects two days on the same weekday', function () {
    putSchedule($this->routine, [
        ['id' => $this->wed->id, 'weekday' => 3],
        ['id' => $this->thu->id, 'weekday' => 3],
        ['id' => $this->extra->id, 'weekday' => null],
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.days.0', 'Hay dos días asignados al mismo día de la semana.');

    expect($this->thu->fresh()->weekday)->toBe(4);
});

it('rejects a schedule that leaves days out', function () {
    putSchedule($this->routine, [
        ['id' => $this->wed->id, 'weekday' => 3],
        ['id' => $this->thu->id, 'weekday' => 4],
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.days.0', 'Faltan días de la rutina.');
});

it('rejects a day of another routine', function () {
    $other = RoutineDay::factory()->for(Routine::factory()->for($this->user))->create();

    putSchedule($this->routine, [
        ['id' => $this->wed->id, 'weekday' => 3],
        ['id' => $this->thu->id, 'weekday' => 4],
        ['id' => $other->id, 'weekday' => null],
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['days.2.id']);
});

it('does not touch a routine of another user', function () {
    $foreign = Routine::factory()->create();

    putSchedule($foreign, [])->assertNotFound();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/RoutineScheduleTest.php`
Expected: FAIL (405/404: la ruta no existe).

- [ ] **Step 3: Write the Form Request**

`backend/app/Http/Requests/RoutineScheduleRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class RoutineScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'days' => ['present', 'array'],
            'days.*.id' => [
                'required', 'integer', 'distinct',
                Rule::exists('routine_days', 'id')->where('routine_id', $this->route('routine')->id),
            ],
            'days.*.weekday' => ['present', 'nullable', 'integer', 'between:1,7'],
        ];
    }

    /** Reglas sobre el conjunto: weekdays sin repetir y todos los días de la rutina presentes. */
    public function after(): array
    {
        return [function (Validator $validator) {
            $days = collect($this->input('days', []));
            $weekdays = $days->pluck('weekday')->reject(fn ($weekday) => $weekday === null);

            if ($weekdays->count() !== $weekdays->unique()->count()) {
                $validator->errors()->add('days', 'Hay dos días asignados al mismo día de la semana.');
            }

            if ($days->count() !== $this->route('routine')->days()->count()) {
                $validator->errors()->add('days', 'Faltan días de la rutina.');
            }
        }];
    }
}
```

- [ ] **Step 4: Add the controller method and the route**

En `backend/app/Http/Controllers/RoutineDayController.php`, agregar el import `use App\Http\Requests\RoutineScheduleRequest;` y este método después de `reorder`:

```php
    /** Reasigna día de la semana y posición de todos los días (tablero semanal). */
    public function schedule(RoutineScheduleRequest $request, Routine $routine): Response
    {
        DB::transaction(function () use ($request, $routine) {
            foreach ($request->validated('days') as $position => $day) {
                $routine->days()->whereKey($day['id'])->update([
                    'weekday' => $day['weekday'],
                    'position' => $position,
                ]);
            }
        });

        return response()->noContent();
    }
```

En `backend/routes/api.php`, dentro del grupo `Route::middleware('can:manage,routine')`, debajo de la línea de `days/reorder`:

```php
        Route::put('/routines/{routine}/schedule', [RoutineDayController::class, 'schedule']);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/RoutineScheduleTest.php`
Expected: 6 passed. Luego `./vendor/bin/pint` y la suite completa `./vendor/bin/pest` en verde.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Requests/RoutineScheduleRequest.php backend/app/Http/Controllers/RoutineDayController.php backend/routes/api.php backend/tests/Feature/Api/RoutineScheduleTest.php
git commit -m "feat(routines): schedule endpoint to reassign every day of the week at once"
```

---

### Task 2: `GET /api/today?day=` (backend)

**Files:**
- Modify: `backend/app/Http/Controllers/TodayController.php`
- Test: `backend/tests/Feature/Api/TodayTest.php`

**Interfaces:**
- Produces: `GET /api/today?day={id}` → misma forma de respuesta; `data.day` es el día pedido; 404 si no es de la rutina activa del usuario.

- [ ] **Step 1: Write the failing tests** (al final de `TodayTest.php`)

```php
it('returns another day of the active routine when asked for it', function () {
    $this->travelTo(Carbon::parse('2026-11-04 15:00:00', 'UTC')); // miércoles, descanso

    $this->getJson("/api/today?day={$this->monday->id}")
        ->assertOk()
        ->assertJsonPath('data.date', '2026-11-04')
        ->assertJsonPath('data.weekday', 3)
        ->assertJsonPath('data.day.name', 'Lunes – Pecho')
        ->assertJsonPath('data.day.exercises.0.exercise.name', 'Press de banca')
        ->assertJsonPath('data.day.exercises.0.last_performance', null);
});

it('returns 404 for a day outside the active routine', function () {
    $inactive = Routine::factory()->for($this->user)->create(['is_active' => false]);
    $day = RoutineDay::factory()->for($inactive)->create(['weekday' => 1]);

    $this->getJson("/api/today?day={$day->id}")->assertNotFound();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/TodayTest.php`
Expected: el primero falla (`data.day` es null en día de descanso), el segundo falla (200 en vez de 404).

- [ ] **Step 3: Implement**

En `backend/app/Http/Controllers/TodayController.php`, agregar `use Illuminate\Http\Request;` y reemplazar la firma y la línea de `$day`:

```php
    public function __invoke(Request $request, LastPerformanceService $lastPerformance): JsonResponse
    {
        $now = now(config('app.user_timezone'));
        $routine = Routine::query()->where('is_active', true)->with('days')->first();
        // ?day=ID: hacer hoy otro día de la rutina activa, sin cambiar la rutina.
        $requested = $request->integer('day') ?: null;
        $day = $requested
            ? ($routine?->days->firstWhere('id', $requested) ?? abort(404))
            : $routine?->days->firstWhere('weekday', $now->dayOfWeekIso);
```

(el resto del método no cambia).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/TodayTest.php`
Expected: PASS. Luego `./vendor/bin/pint` y la suite completa.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/TodayController.php backend/tests/Feature/Api/TodayTest.php
git commit -m "feat(today): pick another day of the active routine with ?day="
```

---

### Task 3: Lógica del tablero (`schedule.ts`) y método de API

**Files:**
- Create: `frontend/src/app/core/routine/schedule.ts`
- Test: `frontend/src/app/core/routine/schedule.spec.ts`
- Modify: `frontend/src/app/core/api/routines-api.ts`

**Interfaces:**
- Produces:
  - `type ScheduleDay = Pick<RoutineDay, 'id' | 'weekday' | 'position'>`
  - `interface DayAssignment { id: number; weekday: number | null }`
  - `boardOrder<T extends ScheduleDay>(days: readonly T[]): T[]` — lunes→domingo y luego la bandeja por `position`.
  - `moveDay<T extends ScheduleDay>(days: readonly T[], dayId: number, target: number | null, trayIndex?: number): T[]` — devuelve todos los días en orden de tablero con `weekday` y `position` nuevos.
  - `toAssignments(days: readonly ScheduleDay[]): DayAssignment[]`
  - `RoutinesApi.schedule(routineId: number, days: DayAssignment[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/core/routine/schedule.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type ScheduleDay, boardOrder, moveDay, toAssignments } from './schedule';

// 1 lun, 2 mié, 3 jue; 4 y 5 sin día fijo (en ese orden).
const days: ScheduleDay[] = [
  { id: 1, weekday: 1, position: 0 },
  { id: 2, weekday: 3, position: 1 },
  { id: 3, weekday: 4, position: 2 },
  { id: 4, weekday: null, position: 3 },
  { id: 5, weekday: null, position: 4 },
];

const plan = (result: ScheduleDay[]) => result.map((d) => [d.id, d.weekday, d.position]);

describe('boardOrder', () => {
  it('sorts by weekday and then the tray by position', () => {
    const result = boardOrder([
      { id: 9, weekday: 5, position: 0 },
      { id: 8, weekday: null, position: 1 },
      { id: 7, weekday: 2, position: 2 },
      { id: 6, weekday: null, position: 0 },
    ]);
    expect(result.map((d) => d.id)).toEqual([7, 9, 6, 8]);
  });
});

describe('moveDay', () => {
  it('swaps two days', () => {
    expect(plan(moveDay(days, 2, 4))).toEqual([
      [1, 1, 0], [3, 3, 1], [2, 4, 2], [4, null, 3], [5, null, 4],
    ]);
  });

  it('moves a day to a rest day', () => {
    expect(plan(moveDay(days, 1, 7))).toEqual([
      [2, 3, 0], [3, 4, 1], [1, 7, 2], [4, null, 3], [5, null, 4],
    ]);
  });

  it('drops a day into the tray at the given index', () => {
    expect(plan(moveDay(days, 2, null, 1))).toEqual([
      [1, 1, 0], [3, 4, 1], [4, null, 2], [2, null, 3], [5, null, 4],
    ]);
  });

  it('sends the displaced day to the tray slot the dragged one left', () => {
    expect(plan(moveDay(days, 5, 3))).toEqual([
      [1, 1, 0], [5, 3, 1], [3, 4, 2], [4, null, 3], [2, null, 4],
    ]);
  });

  it('reorders the tray', () => {
    expect(plan(moveDay(days, 5, null, 0))).toEqual([
      [1, 1, 0], [2, 3, 1], [3, 4, 2], [5, null, 3], [4, null, 4],
    ]);
  });

  it('keeps the other fields of each day', () => {
    const [moved] = moveDay([{ id: 1, weekday: 1, position: 0, name: 'Pecho' }], 1, 2);
    expect(moved).toEqual({ id: 1, weekday: 2, position: 0, name: 'Pecho' });
  });
});

describe('toAssignments', () => {
  it('keeps only id and weekday, in order', () => {
    expect(toAssignments(days.slice(0, 2))).toEqual([
      { id: 1, weekday: 1 },
      { id: 2, weekday: 3 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include src/app/core/routine/schedule.spec.ts`
Expected: FAIL (no existe `./schedule`).

- [ ] **Step 3: Implement**

`frontend/src/app/core/routine/schedule.ts`:

```ts
import type { RoutineDay } from '../models/routine';

export type ScheduleDay = Pick<RoutineDay, 'id' | 'weekday' | 'position'>;

export interface DayAssignment {
  id: number;
  weekday: number | null;
}

/** Orden del tablero: lunes→domingo y después los sin día fijo por posición. */
export function boardOrder<T extends ScheduleDay>(days: readonly T[]): T[] {
  const fixed = days.filter((d) => d.weekday !== null).sort((a, b) => a.weekday! - b.weekday!);
  const tray = days.filter((d) => d.weekday === null).sort((a, b) => a.position - b.position);
  return [...fixed, ...tray];
}

/**
 * Suelta un día en `target` (1–7, o null = sin día fijo, en `trayIndex`).
 * Si el destino está ocupado, el que estaba toma el lugar de origen del arrastrado.
 * Devuelve todos los días en orden de tablero, con `position` = su índice.
 */
export function moveDay<T extends ScheduleDay>(
  days: readonly T[],
  dayId: number,
  target: number | null,
  trayIndex = Number.MAX_SAFE_INTEGER,
): T[] {
  const moving = days.find((d) => d.id === dayId);
  if (!moving) return boardOrder(days);
  const from = moving.weekday;
  const displaced =
    target === null ? undefined : days.find((d) => d.weekday === target && d.id !== dayId);

  const oldTray = boardOrder(days)
    .filter((d) => d.weekday === null)
    .map((d) => d.id);
  const tray = oldTray.filter((id) => id !== dayId);
  if (target === null) {
    tray.splice(Math.min(trayIndex, tray.length), 0, dayId);
  } else if (displaced && from === null) {
    tray.splice(oldTray.indexOf(dayId), 0, displaced.id);
  }

  const weekdayOf = (d: T): number | null => {
    if (d.id === dayId) return target;
    if (displaced && d.id === displaced.id) return from;
    return d.weekday;
  };

  const fixed = days
    .map((d) => ({ ...d, weekday: weekdayOf(d) }))
    .filter((d) => d.weekday !== null)
    .sort((a, b) => a.weekday! - b.weekday!);
  const trayDays = tray.map((id) => ({ ...days.find((d) => d.id === id)!, weekday: null }));

  return [...fixed, ...trayDays].map((d, position) => ({ ...d, position }));
}

export function toAssignments(days: readonly ScheduleDay[]): DayAssignment[] {
  return days.map(({ id, weekday }) => ({ id, weekday }));
}
```

En `frontend/src/app/core/api/routines-api.ts`, agregar `import type { DayAssignment } from '../routine/schedule';` y este método después de `reorderDays`:

```ts
  async schedule(routineId: number, days: DayAssignment[]): Promise<void> {
    await firstValueFrom(this.http.put(`/api/routines/${routineId}/schedule`, { days }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include src/app/core/routine/schedule.spec.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/routine/ frontend/src/app/core/api/routines-api.ts
git commit -m "feat(routines): pure weekly board moves (swap, move, tray) and schedule API call"
```

---

### Task 4: Tablero semanal en el detalle de la rutina

**Files:**
- Create: `frontend/src/app/features/routines/routine-day-card.ts`
- Create: `frontend/src/app/features/routines/weekly-board.ts`
- Test: `frontend/src/app/features/routines/weekly-board.spec.ts`
- Modify: `frontend/src/app/features/routines/routine-detail-page.ts`

**Interfaces:**
- Consumes: `boardOrder`, `moveDay`, `toAssignments`, `RoutinesApi.schedule` (Task 3).
- Produces: `<app-weekly-board [days] (moved) (duplicateDay) (removeDay)>`; `moved` emite `RoutineDay[]` en orden de tablero. `WeeklyBoard.drop(event)` público (lo usan los tests).

Nota: el `cdkDrag` va en el host de `app-routine-day-card` y no dentro de un `ng-template`, porque `cdkDrag` busca su `cdkDropList` por inyección y un template declarado fuera de la lista no la encontraría.

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/features/routines/weekly-board.spec.ts`:

```ts
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import type { RoutineDay } from '../../core/models/routine';
import { WeeklyBoard } from './weekly-board';

const day = (id: number, name: string, weekday: number | null, position: number): RoutineDay => ({
  id,
  routine_id: 7,
  name,
  weekday,
  position,
  exercises: [],
});

const days = [day(1, 'Pecho', 1, 0), day(2, 'Piernas', 4, 1), day(3, 'Extra', null, 2)];

type Drop = CdkDragDrop<number | null, number | null, number>;

function dropEvent(from: number | null, to: number | null, id: number, currentIndex = 0): Drop {
  const previousContainer = { data: from };
  const container = from === to ? previousContainer : { data: to };
  return { previousContainer, container, item: { data: id }, previousIndex: 0, currentIndex } as unknown as Drop;
}

async function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(WeeklyBoard);
  fixture.componentRef.setInput('days', days);
  await fixture.whenStable();
  const moved = vi.fn();
  fixture.componentInstance.moved.subscribe(moved);
  return { board: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, moved };
}

describe('WeeklyBoard', () => {
  it('shows the seven weekdays, rest days and the tray', async () => {
    const { el } = await render();
    const rows = el.querySelectorAll('[data-weekday]');
    expect(rows).toHaveLength(7);
    expect(el.textContent).toContain('LUN');
    expect(el.textContent).toContain('DOM');
    expect(el.querySelector('[data-weekday="1"]')?.textContent).toContain('Pecho');
    expect(el.querySelector('[data-weekday="3"]')?.textContent).toContain('Descanso');
    expect(el.querySelector('[data-weekday="4"]')?.textContent).toContain('Piernas');
    expect(el.querySelector('[data-tray]')?.textContent).toContain('Extra');
    expect(el.querySelector('a[href="/rutinas/7/dias/1"]')).not.toBeNull();
  });

  it('swaps two days when dropping on a busy weekday', async () => {
    const { board, moved } = await render();
    board.drop(dropEvent(1, 4, 1));
    const result = moved.mock.calls[0][0] as RoutineDay[];
    expect(result.map((d) => [d.id, d.weekday])).toEqual([[2, 1], [1, 4], [3, null]]);
  });

  it('moves a day to the tray', async () => {
    const { board, moved } = await render();
    board.drop(dropEvent(4, null, 2, 0));
    const result = moved.mock.calls[0][0] as RoutineDay[];
    expect(result.map((d) => [d.id, d.weekday])).toEqual([[1, 1], [2, null], [3, null]]);
  });

  it('ignores a drop in the same weekday', async () => {
    const { board, moved } = await render();
    board.drop(dropEvent(1, 1, 1));
    expect(moved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/routines/weekly-board.spec.ts`
Expected: FAIL (no existe `./weekly-board`).

- [ ] **Step 3: Create the day card**

`frontend/src/app/features/routines/routine-day-card.ts`:

```ts
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideGripVertical, lucideTrash2 } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import type { RoutineDay } from '../../core/models/routine';

/** Tarjeta de un día en el tablero; el `cdkDrag` lo pone quien la usa, en el host. */
@Component({
  selector: 'app-routine-day-card',
  imports: [CdkDragHandle, RouterLink, NgIcon, HlmButton],
  providers: [provideIcons({ lucideCopy, lucideGripVertical, lucideTrash2 })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card flex items-center gap-2 p-2' },
  template: `
    <button
      cdkDragHandle
      type="button"
      class="flex size-12 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
      aria-label="Arrastrar para cambiar de día"
    >
      <ng-icon name="lucideGripVertical" size="20" />
    </button>
    <a [routerLink]="['/rutinas', day().routine_id, 'dias', day().id]" class="min-w-0 flex-1 py-2">
      <span class="block truncate font-medium">{{ day().name }}</span>
      <span class="text-sm text-muted-foreground">
        {{ count() }} {{ count() === 1 ? 'ejercicio' : 'ejercicios' }}
      </span>
    </a>
    <button hlmBtn variant="ghost" size="icon-lg" (click)="duplicateDay.emit()" aria-label="Duplicar día">
      <ng-icon name="lucideCopy" />
    </button>
    <button hlmBtn variant="ghost" size="icon-lg" (click)="removeDay.emit()" aria-label="Eliminar día">
      <ng-icon name="lucideTrash2" />
    </button>
  `,
})
export class RoutineDayCard {
  readonly day = input.required<RoutineDay>();
  readonly duplicateDay = output<void>();
  readonly removeDay = output<void>();

  protected readonly count = computed(() => this.day().exercises?.length ?? 0);
}
```

- [ ] **Step 4: Create the board**

`frontend/src/app/features/routines/weekly-board.ts`:

```ts
import {
  CdkDrag,
  type CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { WEEKDAYS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { RoutineDay } from '../../core/models/routine';
import { boardOrder, moveDay } from '../../core/routine/schedule';
import { RoutineDayCard } from './routine-day-card';

/** Semana de la rutina: 7 filas + "Sin día fijo". Arrastrar intercambia o mueve días. */
@Component({
  selector: 'app-weekly-board',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, RoutineDayCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div cdkDropListGroup class="mb-6">
      <ol class="mb-4 flex flex-col gap-2">
        @for (w of weekdays; track w) {
          <li class="flex items-center gap-2">
            <span class="num w-10 shrink-0 text-sm font-semibold text-muted-foreground">{{ shortLabel(w) }}</span>
            <div
              cdkDropList
              cdkDropListSortingDisabled
              [cdkDropListData]="w"
              (cdkDropListDropped)="drop($event)"
              [attr.data-weekday]="w"
              class="min-h-16 min-w-0 flex-1"
            >
              @if (byWeekday().get(w); as day) {
                <app-routine-day-card
                  cdkDrag
                  [cdkDragData]="day.id"
                  [day]="day"
                  (duplicateDay)="duplicateDay.emit(day)"
                  (removeDay)="removeDay.emit(day)"
                />
              } @else {
                <p class="flex h-16 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                  Descanso
                </p>
              }
            </div>
          </li>
        }
      </ol>

      <h3 class="mb-2 text-sm font-semibold text-muted-foreground">Sin día fijo</h3>
      <div
        cdkDropList
        [cdkDropListData]="null"
        (cdkDropListDropped)="drop($event)"
        data-tray
        class="flex min-h-16 flex-col gap-2"
      >
        @for (day of tray(); track day.id) {
          <app-routine-day-card
            cdkDrag
            [cdkDragData]="day.id"
            [day]="day"
            (duplicateDay)="duplicateDay.emit(day)"
            (removeDay)="removeDay.emit(day)"
          />
        } @empty {
          <p class="flex h-16 items-center justify-center rounded-xl border border-dashed border-border px-3 text-center text-sm text-muted-foreground">
            Arrastra aquí un día para dejarlo sin día fijo.
          </p>
        }
      </div>
    </div>
  `,
})
export class WeeklyBoard {
  readonly days = input.required<RoutineDay[]>();
  /** Todos los días en orden de tablero, con weekday y position nuevos. */
  readonly moved = output<RoutineDay[]>();
  readonly duplicateDay = output<RoutineDay>();
  readonly removeDay = output<RoutineDay>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly byWeekday = computed(
    () => new Map(this.days().filter((d) => d.weekday !== null).map((d) => [d.weekday!, d])),
  );
  protected readonly tray = computed(() => boardOrder(this.days()).filter((d) => d.weekday === null));

  protected shortLabel(weekday: number): string {
    return WEEKDAY_LABELS[weekday].slice(0, 3).toUpperCase();
  }

  drop(event: CdkDragDrop<number | null, number | null, number>): void {
    const target = event.container.data;
    const sameList = event.previousContainer === event.container;
    if (sameList && (target !== null || event.previousIndex === event.currentIndex)) return;
    this.moved.emit(moveDay(this.days(), event.item.data, target, event.currentIndex));
  }
}
```

- [ ] **Step 5: Run board tests**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/routines/weekly-board.spec.ts`
Expected: 4 passed.

- [ ] **Step 6: Use the board in the routine page**

En `frontend/src/app/features/routines/routine-detail-page.ts`:

1. Imports: borrar el bloque `import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';`, `import { NgIcon, provideIcons } from '@ng-icons/core';` y `import { lucideCopy, lucideGripVertical, lucideTrash2 } from '@ng-icons/lucide';`. Agregar:

```ts
import { toAssignments } from '../../core/routine/schedule';
import { WeeklyBoard } from './weekly-board';
```

2. En `imports: [...]` del componente, quitar `CdkDropList, CdkDrag, CdkDragHandle, NgIcon` y agregar `WeeklyBoard`. Borrar la línea `providers: [provideIcons({ lucideGripVertical, lucideCopy, lucideTrash2 })],`.

3. En el template, reemplazar todo el `<ul cdkDropList ...> … </ul>` que sigue a `<h2 class="mb-2 section-title">Días</h2>` (desde `<ul` hasta su `</ul>`, incluido el `@empty`) por:

```html
      <app-weekly-board
        [days]="r.days ?? []"
        (moved)="schedule(r, $event)"
        (duplicateDay)="duplicate($event)"
        (removeDay)="removeDay($event)"
      />
```

4. Reemplazar el método `dropDay` completo por:

```ts
  /** Optimista: el tablero cambia al tiro y se guarda en segundo plano (si falla, `run` recarga). */
  async schedule(routine: Routine, days: RoutineDay[]): Promise<void> {
    this.routine.set({ ...routine, days });
    await this.run(() => this.api.schedule(routine.id, toAssignments(days)));
  }
```

- [ ] **Step 7: Run the whole frontend suite and build**

Run: `cd frontend && npx ng test --watch=false` y `npx ng build`
Expected: todo en verde, sin errores de compilación de plantillas.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/routines/
git commit -m "feat(routines): weekly board to swap or move training days by dragging"
```

---

### Task 5: "Hacer otro día" en Hoy

**Files:**
- Modify: `frontend/src/app/core/api/today-api.ts`
- Modify: `frontend/src/app/features/today/today-page.ts`
- Test: `frontend/src/app/features/today/today-page.spec.ts`

**Interfaces:**
- Consumes: `GET /api/today?day=` (Task 2).
- Produces: `TodayApi.get(day?: number): Promise<Today>`; input de ruta `dia` en `TodayPage` (`/hoy?dia=12`).

- [ ] **Step 1: Write the failing tests**

En `today-page.spec.ts`:

1. Cambiar la firma de `render` y el mock de `TodayApi`:

```ts
async function render(data: Today, activeId: string | null = null, dia?: string) {
  const sessions = {
    activeId: signal(activeId),
    startFromDay: vi.fn().mockResolvedValue({ id: 'new-session' }),
    startFree: vi.fn().mockResolvedValue({ id: 'free-session' }),
  };
  const api = { get: vi.fn(() => Promise.resolve(data)) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'entrenamiento/:id', component: Blank }]),
      { provide: TodayApi, useValue: api },
```

(el resto de providers igual) y, después de `TestBed.createComponent(TodayPage);`:

```ts
  if (dia) fixture.componentRef.setInput('dia', dia);
```

y devolver también `api`: `return { fixture, sessions, api, el, text: el.textContent as string };`

2. Agregar una constante con dos días y los tests nuevos dentro del `describe`:

```ts
const twoDays: Today = {
  ...today,
  days: [
    { id: 10, name: 'Lunes – Pecho (Bilbo)', weekday: 1 },
    { id: 11, name: 'Jueves – Piernas', weekday: 4 },
  ],
};
```

```ts
  it('offers the other days of the routine below the exercises', async () => {
    const { el, text } = await render(twoDays);
    expect(text).toContain('¿Otro día?');
    expect(el.querySelector('a[href="/hoy?dia=11"]')?.textContent).toContain('Jueves – Piernas');
    expect(el.querySelector('a[href="/hoy?dia=10"]')).toBeNull();
  });

  it('does not offer other days during a workout', async () => {
    const { text } = await render(twoDays, 'abc');
    expect(text).not.toContain('¿Otro día?');
  });

  it('loads the chosen day and offers to go back', async () => {
    const chosen: Today = { ...twoDays, day: { ...twoDays.day!, id: 11, name: 'Jueves – Piernas', weekday: 4 } };
    const { api, el, text } = await render(chosen, null, '11');
    expect(api.get).toHaveBeenCalledWith(11);
    expect(text).toContain('Elegiste para hoy');
    expect(text).not.toContain('Te toca hoy');
    expect(el.querySelector('a[href="/hoy"]')?.textContent).toContain('Volver a lo de hoy');
    expect(el.querySelector('a[href="/hoy?dia=10"]')).not.toBeNull();
  });

  it('lets a rest day pick a day of the routine for today', async () => {
    const { el } = await render({ ...twoDays, weekday: 3, date: '2026-11-04', day: null });
    expect(el.querySelector('a[href="/hoy?dia=10"]')).not.toBeNull();
    expect(el.querySelector('a[href="/rutinas/1/dias/10"]')).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/today/today-page.spec.ts`
Expected: los 4 nuevos fallan; los existentes siguen pasando.

- [ ] **Step 3: Update `TodayApi`**

`frontend/src/app/core/api/today-api.ts`, reemplazar `get`:

```ts
  /** `day`: hacer hoy otro día de la rutina activa (sin cambiar la rutina). */
  async get(day?: number): Promise<Today> {
    const options = day ? { params: { day } } : {};
    return (await firstValueFrom(this.http.get<{ data: Today }>('/api/today', options))).data;
  }
```

- [ ] **Step 4: Update `TodayPage`**

En `frontend/src/app/features/today/today-page.ts`:

1. Agregar `input` al import de `@angular/core`.

2. Reemplazar la propiedad `today`:

```ts
  /** `/hoy?dia=12`: hacer hoy otro día de la rutina activa. */
  readonly dia = input<string>();
  protected readonly chosenDay = computed(() => {
    const id = Number(this.dia());
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  /** Con respaldo local: sin señal muestra el último "Hoy" (o día elegido) descargado. */
  protected readonly today = resource({
    params: () => ({ day: this.chosenDay() }),
    loader: ({ params }) =>
      params.day
        ? cachedFetch(this.db, `today:day:${params.day}`, () => this.api.get(params.day!))
        : cachedFetch(this.db, 'today', () => this.api.get()),
  });
```

3. Template — dentro de `} @else if (t.day; as day) {`, justo antes de `<section class="rounded-3xl bg-primary …">`:

```html
        @if (chosenDay()) {
          <a routerLink="/hoy" class="mb-3 inline-block text-sm text-muted-foreground">← Volver a lo de hoy</a>
        }
```

4. Template — el texto de la etiqueta de la tarjeta:

```html
            {{ sessions.activeId() ? 'Entrenamiento en curso' : chosenDay() ? 'Elegiste para hoy' : 'Te toca hoy' }}
```

5. Template — inmediatamente después del `</ol>` de la lista "Ejercicios" (antes de `} @else {` del día de descanso):

```html
        @if (!sessions.activeId() && t.days.length > 1) {
          <h2 class="section-title mt-6 mb-3">¿Otro día?</h2>
          <ul class="flex flex-col gap-2">
            @for (d of t.days; track d.id) {
              @if (d.id !== day.id) {
                <li><ng-container *ngTemplateOutlet="dayLink; context: { $implicit: d }" /></li>
              }
            }
          </ul>
        }
```

6. Template — en la lista "Días de {{ t.routine.name }}" del día de descanso, reemplazar el `<li>` completo (el que contiene `<a [routerLink]="['/rutinas', t.routine.id, 'dias', d.id]" …>`) por:

```html
            <li><ng-container *ngTemplateOutlet="dayLink; context: { $implicit: d }" /></li>
```

7. Template — junto al `<ng-template #freeOrContinue let-t>`, agregar:

```html
      <ng-template #dayLink let-d>
        <a routerLink="/hoy" [queryParams]="{ dia: d.id }" class="card flex items-center gap-3 p-4">
          <div class="min-w-0 flex-1">
            @if (d.weekday) {
              <span class="eyebrow block text-primary">{{ weekdayLabels[d.weekday] }}</span>
            }
            <span class="font-medium">{{ d.name }}</span>
          </div>
          <ng-icon name="lucideChevronRight" size="20" class="text-muted-foreground" />
        </a>
      </ng-template>
```

8. Template — en la rama `} @else if (today.error()) {`, después del botón "Reintentar":

```html
      @if (chosenDay()) {
        <a routerLink="/hoy" class="mt-3 block text-center text-sm text-muted-foreground underline">Volver a lo de hoy</a>
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/today/today-page.spec.ts`
Expected: todos PASS. Luego la suite completa `npx ng test --watch=false` y `npx ng build`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/api/today-api.ts frontend/src/app/features/today/
git commit -m "feat(today): do another day of the routine today without changing it"
```

---

### Task 6: Verificación local y revisión de Luciano

- [ ] **Step 1:** Suites completas en verde: `cd backend && ./vendor/bin/pest` y `cd frontend && npx ng test --watch=false`.
- [ ] **Step 2:** Levantar (`docker compose up -d`; `ng serve` en :4200 si no está corriendo). Sin migraciones nuevas.
- [ ] **Step 3:** E2E con curl (XSRF): `PUT /api/routines/{id}/schedule` intercambiando dos días → 204, y `GET /api/today?day={id}` → el día pedido.
- [ ] **Step 4:** Pasarle a Luciano el login (`luciano@gymtracker.test` / `password`) y qué mirar: en `/rutinas/{id}`, arrastrar miércoles ↔ jueves, mover un día a "Sin día fijo" y de vuelta, recargar y ver que quedó; en `/hoy`, "¿Otro día?" → elegir uno → "Elegiste para hoy" → Empezar entrenamiento (queda con fecha de hoy) y "Volver a lo de hoy". Probar el arrastre también en el iPhone.
- [ ] **Step 5:** Con su OK ("intégralo a main"): `git push . HEAD:main`, `git checkout main`, `git push origin main` y vigilar el deploy.
