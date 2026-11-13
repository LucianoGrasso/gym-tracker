# Sugerencias de progresión — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al abrir un ejercicio en la sesión, si la última vez todas las series efectivas llegaron al tope del rango con el mismo peso, precargar el peso siguiente y mostrar un aviso con "Mantener".

**Architecture:** Todo en el frontend y sin conexión. Una función pura `suggestProgression` (nuevo `core/workout/progression.ts`) decide la sugerencia a partir de `SessionExercise`; `suggestNextSet` la usa para precargar; `ExerciseCard` muestra el aviso y guarda en un signal local si se descartó. `ExerciseRef` gana `equipment` (el backend ya lo envía).

**Tech Stack:** Angular 22 (Signals, standalone, zoneless), TypeScript estricto, Vitest.

Spec: `docs/superpowers/specs/2026-11-13-sugerencias-progresion-design.md`. Rama: `sugerencias-progresion`.

## Global Constraints

- Textos de UI en español (Chile), kg con coma decimal (`formatKg`: `62.5 → "62,5 kg"`).
- Incrementos: barbell 2,5 · smith 2,5 · dumbbell 2 · machine 5 · cable 5 · bodyweight 2,5 (lastre) · kettlebell 4 · band sin sugerencia.
- Sin cambios de backend, migraciones ni endpoints.
- Calentamientos (`set_type: 'warmup'`) nunca cuentan; Bilbo no recibe sugerencia.
- Nunca `confirm()`/`alert()` del navegador.
- Tests: `cd frontend && npx ng test --watch=false` (verde antes de cada commit; no encadenar con `| tail && git commit`).

## Archivos

| Archivo | Cambio |
|---|---|
| `frontend/src/app/core/models/workout.ts` | `ExerciseRef` con `equipment?` |
| `frontend/src/app/core/workout/session-mapping.ts` (+ spec) | `ref()` copia `equipment` |
| `frontend/src/app/core/workout/progression.ts` (+ spec) | **nuevo**: `PROGRESSION_STEP_KG`, `suggestProgression`, `progressionCopy` |
| `frontend/src/app/core/workout/set-suggestions.ts` (+ spec) | `suggestNextSet(item, progression)` |
| `frontend/src/app/features/workout/exercise-card.ts` (+ spec) | aviso + "Mantener" |

---

### Task 1: `equipment` en la sesión + regla de progresión

**Files:**
- Modify: `frontend/src/app/core/models/workout.ts:1-3`
- Modify: `frontend/src/app/core/workout/session-mapping.ts:5-10`
- Modify: `frontend/src/app/core/workout/session-mapping.spec.ts:75`
- Create: `frontend/src/app/core/workout/progression.ts`
- Test: `frontend/src/app/core/workout/progression.spec.ts`

**Interfaces:**
- Produces: `ExerciseRef.equipment?: Equipment`; `interface ProgressionSuggestion { from: number; to: number; reps: number; lastReps: number; lastSets: number }`; `suggestProgression(item: SessionExercise): ProgressionSuggestion | null`; `interface ProgressionCopy { title: string; detail: string; keep: string }`; `progressionCopy(s: ProgressionSuggestion, usesBodyweight: boolean): ProgressionCopy`; `PROGRESSION_STEP_KG: Record<Equipment, number | null>`.

- [ ] **Step 1: `ExerciseRef` con `equipment` opcional**

En `frontend/src/app/core/models/workout.ts` reemplazar las líneas 1-3:

```ts
import type { Equipment, Exercise, ExerciseSession, SetType, WorkoutSet } from './exercise';

/** `equipment` puede faltar en sesiones guardadas en el dispositivo antes del 2026-11-13. */
export type ExerciseRef = Pick<Exercise, 'id' | 'name' | 'uses_bodyweight' | 'is_unilateral'> & {
  equipment?: Equipment;
};
```

- [ ] **Step 2: Test de mapeo (falla)**

En `frontend/src/app/core/workout/session-mapping.spec.ts`, línea 75, cambiar la expectativa:

```ts
    expect(session.exercises[0].exercise).toEqual({
      id: 1, name: 'Press de banca', uses_bodyweight: false, is_unilateral: false, equipment: 'barbell',
    });
```

Run: `cd frontend && npx ng test --watch=false --include=src/app/core/workout/session-mapping.spec.ts`
Expected: FAIL (falta `equipment`).

- [ ] **Step 3: `ref()` copia `equipment`**

En `frontend/src/app/core/workout/session-mapping.ts` reemplazar `ref`:

```ts
const ref = (exercise: Exercise | ExerciseRef): ExerciseRef => ({
  id: exercise.id,
  name: exercise.name,
  uses_bodyweight: exercise.uses_bodyweight,
  is_unilateral: exercise.is_unilateral,
  equipment: exercise.equipment,
});
```

Run el mismo comando. Expected: PASS.

- [ ] **Step 4: Tests de la regla (fallan)**

Crear `frontend/src/app/core/workout/progression.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Equipment, WorkoutSet } from '../models/exercise';
import type { SessionExercise } from '../models/workout';
import { progressionCopy, suggestProgression } from './progression';

const set = (weight_kg: number, reps: number, set_type: WorkoutSet['set_type'] = 'normal'): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type, weight_kg, reps, side: 'both', rir: null, pain_level: null, notes: null,
});

const exercise = (
  lastSets: WorkoutSet[] | null,
  overrides: Partial<SessionExercise> = {},
  equipment: Equipment | undefined = 'barbell',
  usesBodyweight = false,
): SessionExercise => ({
  id: 'we',
  exercise: { id: 1, name: 'Press', uses_bodyweight: usesBodyweight, is_unilateral: false, equipment },
  position: 0, target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_text: null,
  default_set_type: 'normal', rest_seconds: 120, notes: null,
  last_performance: lastSets ? { workout_id: 'w', date: '2026-11-10', sets: lastSets } : null,
  sets: [], ...overrides,
});

const threeAtTop = [set(60, 12), set(60, 12), set(60, 13)];

describe('suggestProgression', () => {
  it('suggests the next weight when every working set reached the top of the range', () => {
    expect(suggestProgression(exercise(threeAtTop))).toEqual({ from: 60, to: 62.5, reps: 8, lastReps: 12, lastSets: 3 });
  });

  it('ignores warm-ups', () => {
    expect(suggestProgression(exercise([set(40, 10, 'warmup'), ...threeAtTop]))?.to).toBe(62.5);
  });

  it('needs at least the target number of working sets', () => {
    expect(suggestProgression(exercise([set(60, 12), set(60, 12)]))).toBeNull();
  });

  it('needs every set at the top of the range', () => {
    expect(suggestProgression(exercise([set(60, 12), set(60, 12), set(60, 10)]))).toBeNull();
  });

  it('needs the same weight in every set', () => {
    expect(suggestProgression(exercise([set(60, 12), set(62.5, 12), set(60, 12)]))).toBeNull();
  });

  it('needs a rep range, target sets and a previous session', () => {
    expect(suggestProgression(exercise(threeAtTop, { target_reps_max: null }))).toBeNull();
    expect(suggestProgression(exercise(threeAtTop, { target_sets: null }))).toBeNull();
    expect(suggestProgression(exercise(null))).toBeNull();
  });

  it('skips bilbo, bands and unknown equipment', () => {
    expect(suggestProgression(exercise(threeAtTop, { default_set_type: 'bilbo' }))).toBeNull();
    expect(suggestProgression(exercise(threeAtTop, {}, 'band'))).toBeNull();
    expect(suggestProgression(exercise(threeAtTop, {}, undefined))).toBeNull();
  });

  it('steps by equipment', () => {
    const to = (equipment: Equipment) => suggestProgression(exercise(threeAtTop, {}, equipment))?.to;
    expect(to('barbell')).toBe(62.5);
    expect(to('smith')).toBe(62.5);
    expect(to('dumbbell')).toBe(62);
    expect(to('machine')).toBe(65);
    expect(to('cable')).toBe(65);
    expect(to('kettlebell')).toBe(64);
    expect(to('bodyweight')).toBe(62.5);
  });

  it('adds ballast from zero on bodyweight exercises', () => {
    const pullUps = exercise([set(0, 6), set(0, 6), set(0, 7)], { target_reps_min: 4, target_reps_max: 6 }, 'bodyweight', true);
    expect(suggestProgression(pullUps)).toEqual({ from: 0, to: 2.5, reps: 4, lastReps: 6, lastSets: 3 });
  });

  it('proposes the top of the range when there is no minimum', () => {
    expect(suggestProgression(exercise(threeAtTop, { target_reps_min: null }))?.reps).toBe(12);
  });
});

describe('progressionCopy', () => {
  it('describes a weight increase', () => {
    expect(progressionCopy({ from: 60, to: 62.5, reps: 8, lastReps: 12, lastSets: 3 }, false)).toEqual({
      title: '¡Sube a 62,5 kg!',
      detail: 'La última vez: 3×12 con 60 kg',
      keep: 'Mantener 60 kg',
    });
  });

  it('describes adding ballast from bodyweight only', () => {
    expect(progressionCopy({ from: 0, to: 2.5, reps: 4, lastReps: 6, lastSets: 3 }, true)).toEqual({
      title: '¡Agrega 2,5 kg de lastre!',
      detail: 'La última vez: 3×6 sin lastre',
      keep: 'Mantener sin lastre',
    });
  });

  it('describes raising existing ballast', () => {
    expect(progressionCopy({ from: 5, to: 7.5, reps: 4, lastReps: 6, lastSets: 3 }, true)).toEqual({
      title: '¡Sube el lastre a 7,5 kg!',
      detail: 'La última vez: 3×6 con +5 kg',
      keep: 'Mantener +5 kg',
    });
  });
});
```

Run: `cd frontend && npx ng test --watch=false --include=src/app/core/workout/progression.spec.ts`
Expected: FAIL (no existe `./progression`).

- [ ] **Step 5: Implementar `progression.ts`**

Crear `frontend/src/app/core/workout/progression.ts`:

```ts
import { formatKg } from '../format/format';
import type { Equipment } from '../models/exercise';
import type { SessionExercise } from '../models/workout';
import { workingSets } from './set-suggestions';

/** Cuánto sube el peso según el equipamiento; `null` = no se sugiere (bandas). */
export const PROGRESSION_STEP_KG: Record<Equipment, number | null> = {
  barbell: 2.5,
  smith: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 5,
  bodyweight: 2.5,
  kettlebell: 4,
  band: null,
};

export interface ProgressionSuggestion {
  /** Peso de la última vez (en peso corporal: lastre). */
  from: number;
  to: number;
  /** Reps propuestas con el peso nuevo: el mínimo del rango. */
  reps: number;
  /** Reps más bajas de la última vez (para "3×12"). */
  lastReps: number;
  lastSets: number;
}

/**
 * Doble progresión: si la última vez todas las series efectivas (al menos las objetivo)
 * usaron el mismo peso y llegaron al tope del rango, sugiere subir un escalón.
 */
export function suggestProgression(item: SessionExercise): ProgressionSuggestion | null {
  const { target_sets: targetSets, target_reps_min: min, target_reps_max: max } = item;
  if (targetSets === null || max === null || item.default_set_type === 'bilbo') return null;
  const equipment = item.exercise.equipment;
  const step = equipment ? PROGRESSION_STEP_KG[equipment] : null;
  if (!step) return null;

  const sets = workingSets(item.last_performance?.sets ?? []);
  if (sets.length === 0 || sets.length < targetSets) return null;
  const from = sets[0].weight_kg;
  if (sets.some((s) => s.weight_kg !== from || s.reps < max)) return null;

  return {
    from,
    to: Math.round((from + step) * 100) / 100,
    reps: min ?? max,
    lastReps: Math.min(...sets.map((s) => s.reps)),
    lastSets: sets.length,
  };
}

export interface ProgressionCopy {
  title: string;
  detail: string;
  keep: string;
}

export function progressionCopy(s: ProgressionSuggestion, usesBodyweight: boolean): ProgressionCopy {
  const done = `${s.lastSets}×${s.lastReps}`;
  if (!usesBodyweight) {
    return {
      title: `¡Sube a ${formatKg(s.to)}!`,
      detail: `La última vez: ${done} con ${formatKg(s.from)}`,
      keep: `Mantener ${formatKg(s.from)}`,
    };
  }
  if (s.from === 0) {
    return {
      title: `¡Agrega ${formatKg(s.to)} de lastre!`,
      detail: `La última vez: ${done} sin lastre`,
      keep: 'Mantener sin lastre',
    };
  }
  return {
    title: `¡Sube el lastre a ${formatKg(s.to)}!`,
    detail: `La última vez: ${done} con +${formatKg(s.from)}`,
    keep: `Mantener +${formatKg(s.from)}`,
  };
}
```

- [ ] **Step 6: Correr los tests**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS (toda la suite).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/models/workout.ts frontend/src/app/core/workout/session-mapping.ts \
  frontend/src/app/core/workout/session-mapping.spec.ts frontend/src/app/core/workout/progression.ts \
  frontend/src/app/core/workout/progression.spec.ts
git commit -m "feat(progression): double progression rule with steps by equipment"
```

---

### Task 2: `suggestNextSet` precarga la sugerencia

**Files:**
- Modify: `frontend/src/app/core/workout/set-suggestions.ts` (función `suggestNextSet`)
- Test: `frontend/src/app/core/workout/set-suggestions.spec.ts` (bloque `describe('suggestNextSet')`)

**Interfaces:**
- Consumes: `ProgressionSuggestion` (Task 1).
- Produces: `suggestNextSet(item: SessionExercise, progression?: ProgressionSuggestion | null): WorkoutSetInput`.

- [ ] **Step 1: Tests (fallan)**

En `frontend/src/app/core/workout/set-suggestions.spec.ts`, dentro de `describe('suggestNextSet', …)`, agregar al final:

```ts
  const progression = { from: 60, to: 62.5, reps: 8, lastReps: 12, lastSets: 3 };
  const lastTime = { workout_id: 'w', date: '2026-11-10', sets: [set(60, 12), set(60, 12), set(60, 12)] };

  it('prefills the suggested weight and the bottom of the range', () => {
    expect(suggestNextSet(exercise({ last_performance: lastTime }), progression))
      .toEqual({ weight_kg: 62.5, reps: 8, set_type: 'normal', side: 'both', rir: null, pain_level: null, notes: null });
  });

  it('keeps the suggestion after a warm-up', () => {
    expect(suggestNextSet(exercise({ last_performance: lastTime, sets: [set(40, 10, 'warmup')] }), progression))
      .toMatchObject({ weight_kg: 62.5, reps: 8, set_type: 'normal' });
  });

  it('copies today\'s previous working set once there is one', () => {
    expect(suggestNextSet(exercise({ last_performance: lastTime, sets: [set(62.5, 9)] }), progression))
      .toMatchObject({ weight_kg: 62.5, reps: 9 });
  });

  it('uses last time without a suggestion', () => {
    expect(suggestNextSet(exercise({ last_performance: lastTime }), null)).toMatchObject({ weight_kg: 60, reps: 12 });
  });
```

Run: `cd frontend && npx ng test --watch=false --include=src/app/core/workout/set-suggestions.spec.ts`
Expected: FAIL en los dos primeros (precarga 60 × 12).

- [ ] **Step 2: Implementar**

En `frontend/src/app/core/workout/set-suggestions.ts`, agregar arriba:

```ts
import type { ProgressionSuggestion } from './progression';
```

y reemplazar el comienzo de `suggestNextSet` (comentario, firma y primer `if`) por:

```ts
/**
 * Valores iniciales de la próxima serie: la anterior de hoy, o la primera efectiva de la última vez.
 * Tras un calentamiento se vuelve al tipo de la rutina y a la carga efectiva de la última vez.
 * Con una sugerencia de progresión y sin series efectivas hoy, se precarga el peso nuevo.
 */
export function suggestNextSet(
  item: SessionExercise,
  progression: ProgressionSuggestion | null = null,
): WorkoutSetInput {
  const lastHere = item.sets.at(-1);
  const previous = item.last_performance?.sets;
  if (lastHere && !isWarmup(lastHere)) {
    return { ...toSetInput(lastHere), pain_level: null, notes: null };
  }
  if (progression && workingSets(item.sets).length === 0) {
    return {
      weight_kg: progression.to,
      reps: progression.reps,
      set_type: item.default_set_type,
      side: lastHere?.side ?? 'both',
      rir: null,
      pain_level: null,
      notes: null,
    };
  }
```

(el resto de la función queda igual). `progression.ts` importa `workingSets` en runtime y `set-suggestions.ts` solo importa el tipo: no hay ciclo en runtime.

- [ ] **Step 3: Correr los tests**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/workout/set-suggestions.ts frontend/src/app/core/workout/set-suggestions.spec.ts
git commit -m "feat(progression): prefill the next set with the suggested weight"
```

---

### Task 3: Aviso en la tarjeta del ejercicio con "Mantener"

**Files:**
- Modify: `frontend/src/app/features/workout/exercise-card.ts`
- Test: `frontend/src/app/features/workout/exercise-card.spec.ts`

**Interfaces:**
- Consumes: `suggestProgression`, `progressionCopy` (Task 1); `suggestNextSet(item, progression)` (Task 2).

- [ ] **Step 1: Tests (fallan)**

En `frontend/src/app/features/workout/exercise-card.spec.ts`:

1. Cambiar la firma de `render` para aceptar el ejercicio:

```ts
async function render(finished = false, data: SessionExercise = item) {
```

y dentro, `fixture.componentRef.setInput('item', data);`.

2. Agregar después de la constante `item`:

```ts
const dumbbellPress: SessionExercise = {
  ...item,
  id: 'we2',
  exercise: { id: 2, name: 'Press con mancuernas', uses_bodyweight: false, is_unilateral: false, equipment: 'dumbbell' },
  target_sets: 3,
  target_reps_min: 8,
  target_reps_max: 12,
  target_text: null,
  default_set_type: 'normal',
  rest_seconds: 120,
  last_performance: {
    workout_id: 'w0',
    date: '2026-11-10',
    sets: [1, 2, 3].map((n) => ({
      id: `p${n}`, set_number: n, set_type: 'normal' as const, weight_kg: 24, reps: 12,
      side: 'both' as const, rir: null, pain_level: null, notes: null,
    })),
  },
};
```

3. Agregar dentro de `describe('ExerciseCard', …)`:

```ts
  it('suggests the next weight and prefills it', async () => {
    const { el, fixture, sessions } = await render(false, dumbbellPress);
    expect(el.textContent).toContain('📈 ¡Sube a 26 kg!');
    expect(el.textContent).toContain('La última vez: 3×12 con 24 kg');

    button(el, 'Guardar serie').click();
    await fixture.whenStable();
    expect(sessions.addSet).toHaveBeenCalledWith('we2', expect.objectContaining({ weight_kg: 26, reps: 8 }));
  });

  it('keeps last time\'s weight when asked', async () => {
    const { el, fixture, sessions } = await render(false, dumbbellPress);
    button(el, 'Mantener 24 kg').click();
    await fixture.whenStable();
    expect(el.textContent).not.toContain('¡Sube a 26 kg!');

    button(el, 'Guardar serie').click();
    await fixture.whenStable();
    expect(sessions.addSet).toHaveBeenCalledWith('we2', expect.objectContaining({ weight_kg: 24, reps: 12 }));
  });

  it('hides the suggestion once a working set is logged today', async () => {
    const logged = { ...dumbbellPress.last_performance!.sets[0], id: 't1', weight_kg: 26, reps: 9 };
    const { el } = await render(false, { ...dumbbellPress, sets: [logged] });
    expect(el.textContent).not.toContain('¡Sube a 26 kg!');
  });
```

Run: `cd frontend && npx ng test --watch=false --include=src/app/features/workout/exercise-card.spec.ts`
Expected: FAIL en los tres nuevos.

- [ ] **Step 2: Lógica en la clase**

En `frontend/src/app/features/workout/exercise-card.ts`:

- Agregar el import:

```ts
import { progressionCopy, suggestProgression } from '../../core/workout/progression';
```

- Reemplazar la línea `protected readonly entry = linkedSignal<WorkoutSetInput>(() => suggestNextSet(this.item()));` por:

```ts
  /** "Mantener" descarta la sugerencia de subir peso en esta tarjeta (no se sincroniza). */
  protected readonly keepWeight = signal(false);
  protected readonly progression = computed(() =>
    this.keepWeight() || workingSets(this.item().sets).length > 0 ? null : suggestProgression(this.item()),
  );
  protected readonly progressionText = computed(() => {
    const suggestion = this.progression();
    return suggestion ? progressionCopy(suggestion, this.item().exercise.uses_bodyweight) : null;
  });
  protected readonly entry = linkedSignal<WorkoutSetInput>(() =>
    suggestNextSet(this.item(), this.progression()),
  );
```

- En `cancelEdit()`, cambiar `this.entry.set(suggestNextSet(this.item()));` por:

```ts
    this.entry.set(suggestNextSet(this.item(), this.progression()));
```

- [ ] **Step 3: Aviso en la plantilla**

Insertar justo antes de `      <div class="grid grid-cols-2 gap-3">` (el bloque del stepper de peso/reps):

```html
      @if (!finished() && progressionText(); as copy) {
        <div
          class="mb-3 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3"
          role="status"
        >
          <div class="min-w-0">
            <p class="font-semibold text-primary">📈 {{ copy.title }}</p>
            <p class="num text-sm text-muted-foreground">{{ copy.detail }}</p>
          </div>
          <button hlmBtn variant="ghost" size="sm" class="shrink-0" (click)="keepWeight.set(true)">
            {{ copy.keep }}
          </button>
        </div>
      }
```

- [ ] **Step 4: Correr tests y build**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS (toda la suite).

Run: `cd frontend && npx ng build`
Expected: build OK (sin errores de tipos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/workout/exercise-card.ts frontend/src/app/features/workout/exercise-card.spec.ts
git commit -m "feat(progression): suggestion banner with keep-weight option in the exercise card"
```

---

## Revisión de Luciano (después de las tareas)

- Levantar `docker compose up -d` y `cd frontend && npm start`; entrar con `luciano@gymtracker.test` / `password`.
- Para ver el aviso hace falta un ejercicio cuya última sesión tenga todas las series al tope con el mismo peso (registrar una sesión así en local, o probar con un ejercicio sembrado). Revisar: texto del aviso, precarga, "Mantener", que desaparezca tras la primera serie efectiva y que no aparezca en Bilbo.
- Con su OK: "intégralo a main" (`git push . HEAD:main`, push a `origin main` despliega).
