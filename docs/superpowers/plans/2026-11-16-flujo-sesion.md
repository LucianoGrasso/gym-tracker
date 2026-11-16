# Flujo de la sesión (terminar antes, "Hacer ahora") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En la sesión en curso, poder terminar un ejercicio antes de completar sus series y hacer ahora un ejercicio pendiente de más abajo.

**Architecture:** Funciones puras en `core/workout/session-flow.ts`; `WorkoutSessionService` suma `endExercise`, `resumeExercise` y `doNow`; `workout-page` decide por ejercicio qué mostrar (tarjeta compacta, "Terminar ejercicio", "Hacer ahora"). `ended_early` es solo local; el nuevo orden se sincroniza con el upsert existente de `workout-exercises`. Sin cambios en el backend ni en las tarjetas.

**Tech Stack:** Angular 22 (Signals, zoneless), Dexie, Vitest.

Spec: `docs/superpowers/specs/2026-11-16-flujo-sesion-design.md`.

## Global Constraints

- Rama `cardio`. Textos de UI en español (Chile).
- `ended_early` nunca va en `workoutExercisePayload` (no se sincroniza).
- "Hacer ahora" encola `PUT /api/workout-exercises/{id}` solo para los ejercicios cuya `position` cambió.
- Botones solo en la sesión en curso. Las tarjetas `ExerciseCard` y `CardioCard` no cambian.
- Tests: `cd frontend && npx ng test --watch=false`.

---

### Task 1: Funciones puras del flujo

**Files:**
- Modify: `frontend/src/app/core/models/workout.ts`
- Modify: `frontend/src/app/core/workout/set-suggestions.ts`
- Create: `frontend/src/app/core/workout/session-flow.ts`
- Test: `frontend/src/app/core/workout/session-flow.spec.ts`, `frontend/src/app/core/workout/set-suggestions.spec.ts`

**Interfaces:**
- Produces:
  - `SessionExercise.ended_early?: boolean`
  - `isPending` devuelve `false` si `ended_early`.
  - `moveBefore(exercises: SessionExercise[], id: string, beforeId: string): SessionExercise[]`
  - `endedLabel(item: SessionExercise): string`
  - `type FlowState = 'ended' | 'current' | 'waiting' | 'none'`; `flowState(item: SessionExercise, currentId: string | null, active: boolean): FlowState`

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/core/workout/session-flow.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from '../models/exercise';
import type { SessionExercise } from '../models/workout';
import { endedLabel, flowState, moveBefore } from './session-flow';

const set = (set_type: WorkoutSet['set_type'] = 'normal'): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type, weight_kg: 40, reps: 10, side: 'both', rir: null, pain_level: null, notes: null,
});

const item = (id: string, position: number, overrides: Partial<SessionExercise> = {}): SessionExercise => ({
  id, exercise: { id: position + 1, name: id, uses_bodyweight: false, is_unilateral: false }, position,
  target_sets: 4, target_reps_min: 8, target_reps_max: 12, target_text: null, default_set_type: 'normal',
  rest_seconds: 120, notes: null, last_performance: null, sets: [], ...overrides,
});

describe('moveBefore', () => {
  it('moves an exercise before another and renumbers the positions', () => {
    const list = [item('a', 0), item('b', 1), item('c', 2), item('d', 3)];
    const moved = moveBefore(list, 'd', 'b');
    expect(moved.map((e) => e.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(moved.map((e) => e.position)).toEqual([0, 1, 2, 3]);
  });
  it('leaves the list as it is when the ids are unknown or equal', () => {
    const list = [item('a', 0), item('b', 1)];
    expect(moveBefore(list, 'a', 'a').map((e) => e.id)).toEqual(['a', 'b']);
    expect(moveBefore(list, 'x', 'a').map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('endedLabel', () => {
  it('counts working sets against the target', () => {
    expect(endedLabel(item('a', 0, { sets: [set('warmup'), set(), set()] }))).toBe('Terminado · 2 de 4');
  });
  it('counts sets without a target and segments for cardio', () => {
    expect(endedLabel(item('a', 0, { target_sets: null, sets: [set()] }))).toBe('Terminado · 1 serie');
    expect(endedLabel(item('a', 0, { target_sets: null, sets: [] }))).toBe('Terminado · 0 series');
    const cardio = item('c', 0, { exercise: { id: 9, name: 'Trote', uses_bodyweight: false, is_unilateral: false, kind: 'cardio' }, sets: [set()] });
    expect(endedLabel(cardio)).toBe('Terminado · 1 tramo');
  });
});

describe('flowState', () => {
  it('tells what each exercise of the active session offers', () => {
    expect(flowState(item('a', 0, { ended_early: true }), 'b', true)).toBe('ended');
    expect(flowState(item('b', 1), 'b', true)).toBe('current');
    expect(flowState(item('c', 2), 'b', true)).toBe('waiting');
    expect(flowState(item('d', 3, { sets: [set(), set(), set(), set()] }), 'b', true)).toBe('none');
  });
  it('offers nothing in a finished session', () => {
    expect(flowState(item('a', 0, { ended_early: true }), null, false)).toBe('none');
    expect(flowState(item('b', 1), null, false)).toBe('none');
  });
});
```

En `set-suggestions.spec.ts`, dentro del `describe('isPending')` existente:

```ts
  it('stops being pending when ended early', () => {
    expect(isPending(exercise({ ended_early: true }))).toBe(false);
    expect(isPending(exercise({ ended_early: false }))).toBe(true);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (`./session-flow` no existe; `ended_early` no está en el tipo).

- [ ] **Step 3: Implement**

`core/models/workout.ts`, en `SessionExercise` después de `sets`:

```ts
  /** Terminado antes de completar sus series (solo local: no se sincroniza). */
  ended_early?: boolean;
```

`set-suggestions.ts`, primera línea de `isPending`:

```ts
  if (item.ended_early) return false;
```

`core/workout/session-flow.ts`:

```ts
import type { SessionExercise } from '../models/workout';
import { isCardio } from './cardio';
import { isPending, workingSets } from './set-suggestions';

export type FlowState = 'ended' | 'current' | 'waiting' | 'none';

/** Mueve `id` justo antes de `beforeId` y renumera las posiciones 0..n-1. */
export function moveBefore(exercises: SessionExercise[], id: string, beforeId: string): SessionExercise[] {
  const moving = exercises.find((e) => e.id === id);
  if (!moving || id === beforeId || !exercises.some((e) => e.id === beforeId)) return exercises;
  const rest = exercises.filter((e) => e.id !== id);
  const at = rest.findIndex((e) => e.id === beforeId);
  return [...rest.slice(0, at), moving, ...rest.slice(at)].map((e, position) => ({ ...e, position }));
}

/** "Terminado · 2 de 4", "Terminado · 1 serie", "Terminado · 1 tramo". */
export function endedLabel(item: SessionExercise): string {
  if (isCardio(item.exercise)) {
    const n = item.sets.length;
    return `Terminado · ${n} ${n === 1 ? 'tramo' : 'tramos'}`;
  }
  const done = workingSets(item.sets).length;
  if (item.target_sets !== null) return `Terminado · ${done} de ${item.target_sets}`;
  return `Terminado · ${done} ${done === 1 ? 'serie' : 'series'}`;
}

/** Qué ofrece cada ejercicio en la sesión: tarjeta compacta, "Terminar ejercicio", "Hacer ahora" o nada. */
export function flowState(item: SessionExercise, currentId: string | null, active: boolean): FlowState {
  if (!active) return 'none';
  if (item.ended_early) return 'ended';
  if (item.id === currentId) return 'current';
  return isPending(item) ? 'waiting' : 'none';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core
git commit -m "feat(workout): session flow helpers to end early and reorder"
```

---

### Task 2: Acciones en `WorkoutSessionService`

**Files:**
- Modify: `frontend/src/app/core/workout/workout-session.service.ts`
- Test: `frontend/src/app/core/workout/workout-session.service.spec.ts`

**Interfaces:**
- Consumes: `moveBefore`, `isPending` (Task 1).
- Produces: `endExercise(id: string): Promise<void>`, `resumeExercise(id: string): Promise<void>`, `doNow(id: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests** (dentro del `describe('WorkoutSessionService')`)

```ts
  const threeExercises: Today = {
    ...today,
    day: {
      ...today.day!,
      exercises: [0, 1, 2].map((position) => ({
        ...today.day!.exercises[0],
        id: 100 + position,
        position,
        exercise: { ...bench, id: position + 1, name: `E${position}` },
      })),
    },
  };

  it('ends an exercise early and resumes it, locally only', async () => {
    const service = create();
    const session = await service.startFromDay(threeExercises);
    const first = session.exercises[0].id;
    enqueue.mockClear();

    await service.endExercise(first);
    expect(service.session()!.exercises[0].ended_early).toBe(true);
    expect((await db.sessions.get(session.id))!.exercises[0].ended_early).toBe(true);

    await service.resumeExercise(first);
    expect(service.session()!.exercises[0].ended_early).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does an exercise now: before the current one, queuing only the moved positions', async () => {
    const service = create();
    const session = await service.startFromDay(threeExercises);
    const [e0, e1, e2] = session.exercises.map((e) => e.id);
    await service.endExercise(e0);
    enqueue.mockClear();

    await service.doNow(e2);

    expect(service.session()!.exercises.map((e) => e.id)).toEqual([e0, e2, e1]);
    expect(enqueue.mock.calls.map(([method, url, body]) => `${method} ${url} ${body.position}`)).toEqual([
      `PUT /api/workout-exercises/${e2} 1`,
      `PUT /api/workout-exercises/${e1} 2`,
    ]);
    expect(enqueue.mock.calls[0][2]).not.toHaveProperty('ended_early');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (`endExercise` no existe).

- [ ] **Step 3: Implement**

En `workout-session.service.ts`, importar `moveBefore` de `./session-flow` e `isPending` de `./set-suggestions`, y agregar después de `removeExercise`:

```ts
  /** Da por terminado un ejercicio aunque le falten series (solo en este dispositivo). */
  async endExercise(workoutExerciseId: string): Promise<void> {
    await this.replaceExercise({ ...this.exercise(workoutExerciseId), ended_early: true });
  }

  async resumeExercise(workoutExerciseId: string): Promise<void> {
    await this.replaceExercise({ ...this.exercise(workoutExerciseId), ended_early: false });
  }

  /** Mueve un ejercicio pendiente justo antes del que toca y sincroniza las posiciones que cambiaron. */
  async doNow(workoutExerciseId: string): Promise<void> {
    const session = this.require();
    const current = session.exercises.find(isPending);
    if (!current) return;
    const before = new Map(session.exercises.map((e) => [e.id, e.position]));
    const exercises = moveBefore(session.exercises, workoutExerciseId, current.id);
    await this.save({ ...session, exercises });
    for (const item of exercises.filter((e) => before.get(e.id) !== e.position)) {
      await this.sync.enqueue('PUT', `/api/workout-exercises/${item.id}`, workoutExercisePayload(session.id, item));
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/workout
git commit -m "feat(workout): end an exercise early and do another now"
```

---

### Task 3: Botones y tarjeta compacta en la sesión

**Files:**
- Modify: `frontend/src/app/features/workout/workout-page.ts`
- Test: `frontend/src/app/features/workout/workout-page.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `flowState`, `endedLabel` (Task 1); `endExercise`, `resumeExercise`, `doNow` (Task 2).

- [ ] **Step 1: Write the failing test**

`frontend/src/app/features/workout/workout-page.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { LOCAL_DB, LocalDb } from '../../core/local-db/local-db';
import type { WorkoutSet } from '../../core/models/exercise';
import type { Session, SessionExercise } from '../../core/models/workout';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { WorkoutPage } from './workout-page';

const set = (): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type: 'normal', weight_kg: 40, reps: 10, side: 'both', rir: null, pain_level: null, notes: null,
});

const item = (id: string, position: number, overrides: Partial<SessionExercise> = {}): SessionExercise => ({
  id, exercise: { id: position + 1, name: `Ejercicio ${id}`, uses_bodyweight: false, is_unilateral: false }, position,
  target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_text: null, default_set_type: 'normal',
  rest_seconds: 120, notes: null, last_performance: null, sets: [], ...overrides,
});

async function render(exercises: SessionExercise[], active = true) {
  const session = signal<Session>({
    id: 'w1', routine_day_id: 1, name: 'Lunes', date: '2026-11-16', started_at: '2026-11-16T10:00:00Z',
    finished_at: active ? null : '2026-11-16T11:00:00Z', bodyweight_kg: null, notes: null, exercises,
  });
  const sessions = {
    session, activeId: signal(active ? 'w1' : null), open: vi.fn().mockResolvedValue(undefined),
    endExercise: vi.fn(), resumeExercise: vi.fn(), doNow: vi.fn(),
    addSet: vi.fn(), updateSet: vi.fn(), deleteSet: vi.fn(), removeExercise: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      { provide: LOCAL_DB, useValue: new LocalDb(`test-${crypto.randomUUID()}`) },
      { provide: WorkoutSessionService, useValue: sessions },
      { provide: RestTimerService, useValue: { start: vi.fn(), stop: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(WorkoutPage);
  fixture.componentRef.setInput('id', 'w1');
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = (label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).filter((b) => b.textContent!.trim() === label);
  return { fixture, el, sessions, buttons };
}

describe('WorkoutPage session flow', () => {
  it('offers to end the current exercise and to do the waiting ones now', async () => {
    const { buttons, sessions } = await render([item('a', 0, { sets: [set(), set(), set()] }), item('b', 1), item('c', 2)]);

    expect(buttons('Terminar ejercicio')).toHaveLength(1);
    expect(buttons('Hacer ahora')).toHaveLength(1);

    buttons('Terminar ejercicio')[0].click();
    expect(sessions.endExercise).toHaveBeenCalledWith('b');
    buttons('Hacer ahora')[0].click();
    expect(sessions.doNow).toHaveBeenCalledWith('c');
  });

  it('shows an exercise ended early as a compact card that can be resumed', async () => {
    const { el, buttons, sessions } = await render([item('a', 0, { ended_early: true, sets: [set()] }), item('b', 1)]);

    const ended = el.querySelector('[data-ended]')!;
    expect(ended.textContent).toContain('Ejercicio a');
    expect(ended.textContent).toContain('Terminado · 1 de 3');
    expect(el.querySelectorAll('app-exercise-card')).toHaveLength(1);

    buttons('Retomar')[0].click();
    expect(sessions.resumeExercise).toHaveBeenCalledWith('a');
  });

  it('offers nothing in a finished session', async () => {
    const { buttons } = await render([item('a', 0), item('b', 1)], false);
    expect(buttons('Terminar ejercicio')).toHaveLength(0);
    expect(buttons('Hacer ahora')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (no hay botones "Terminar ejercicio").

- [ ] **Step 3: Implement**

En `workout-page.ts`, importar `endedLabel` y `flowState` de `../../core/workout/session-flow`, exponer `protected readonly endedLabel = endedLabel;` y `protected readonly flowState = flowState;`, y reemplazar el cuerpo del `@for` de ejercicios por:

```html
        @for (item of s.exercises; track item.id) {
          @let state = flowState(item, currentId(), isActive());
          @if (state === 'ended') {
            <article data-ended class="card flex items-center justify-between gap-3 p-4 opacity-70">
              <div class="min-w-0">
                <h2 class="truncate text-lg leading-tight font-semibold">{{ item.exercise.name }}</h2>
                <p class="num text-sm text-muted-foreground">{{ endedLabel(item) }}</p>
              </div>
              <button hlmBtn variant="outline" class="h-12 shrink-0" (click)="sessions.resumeExercise(item.id)">Retomar</button>
            </article>
          } @else {
            @if (isCardio(item.exercise)) {
              <app-cardio-card [item]="item" [finished]="!isActive()" [current]="item.id === currentId()" />
            } @else {
              <app-exercise-card [item]="item" [finished]="!isActive()" [current]="item.id === currentId()" />
            }
            @if (state === 'current') {
              <button hlmBtn variant="ghost" class="-mt-1 h-12 text-muted-foreground" (click)="sessions.endExercise(item.id)">Terminar ejercicio</button>
            } @else if (state === 'waiting') {
              <button hlmBtn variant="ghost" class="-mt-1 h-12 text-muted-foreground" (click)="sessions.doNow(item.id)">Hacer ahora</button>
            }
          }
        } @empty {
```

`sessions` es `private` en `WorkoutPage`: cambiarlo a `protected readonly sessions = inject(WorkoutSessionService);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/workout
git commit -m "feat(workout): end exercise and do now buttons in the session"
```
