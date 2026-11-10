# Calentamientos visibles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar calentamientos con un toque durante el entreno, sin que cuenten como series efectivas ni arrastren su tipo/peso a la serie siguiente.

**Architecture:** Lógica pura en `core/workout/set-suggestions.ts` (qué es efectiva, numeración, pendiente, sugerencia, descanso) y UI en `features/workout/exercise-card.ts` (chip, lista, temporizador). `workout-page.ts` usa el `isPending` compartido. Backend sin cambios.

**Tech Stack:** Angular 22 (signals, zoneless), Vitest, Tailwind 4.

Spec: `docs/superpowers/specs/2026-11-10-calentamientos-design.md`.

## Global Constraints

- Textos de UI en español (Chile); código en inglés.
- `WARMUP_REST_SECONDS = 60`; descanso tras calentamiento = `min(rest_seconds, 60)`.
- Calentamiento = `set_type === 'warmup'`. Todo lo demás es efectiva.
- Tests: `cd frontend && npx ng test --watch=false`.

---

### Task 1: Lógica pura de calentamientos

**Files:**
- Modify: `frontend/src/app/core/workout/set-suggestions.ts`
- Test: `frontend/src/app/core/workout/set-suggestions.spec.ts`

**Interfaces:**
- Produces:
  - `WARMUP_REST_SECONDS = 60`
  - `isWarmup(set: { set_type: SetType }): boolean`
  - `workingSets<T extends { set_type: SetType }>(sets: T[]): T[]`
  - `setNumberLabels(sets: { set_type: SetType }[]): string[]` → `'C'` para calentamientos, `'1'..'n'` para efectivas
  - `isPending(item: SessionExercise): boolean` (cuenta solo efectivas)
  - `restAfter(set: { set_type: SetType }, restSeconds: number): number`
  - `suggestNextSet(item)` con el nuevo caso "última serie de hoy es calentamiento"

- [ ] **Step 1: Write the failing tests** — agregar a `set-suggestions.spec.ts` (ampliar el import con `isPending, restAfter, setNumberLabels, workingSets, WARMUP_REST_SECONDS`):

```ts
describe('warm-ups', () => {
  const last = { workout_id: 'w', date: '2026-11-03', sets: [set(40, 10, 'warmup'), set(80, 6, 'heavy'), set(80, 5, 'heavy')] };

  it('after a warm-up, goes back to the routine type with last time working weight', () => {
    const s = suggestNextSet(exercise({ default_set_type: 'heavy', last_performance: last, sets: [set(50, 8, 'warmup', { rir: 3 })] }));
    expect(s).toEqual({ weight_kg: 80, reps: 6, set_type: 'heavy', side: 'both', rir: null, pain_level: null, notes: null });
  });

  it('after a warm-up without history, keeps the warm-up load but the routine type', () => {
    const s = suggestNextSet(exercise({ default_set_type: 'heavy', sets: [set(50, 8, 'warmup')] }));
    expect(s).toMatchObject({ weight_kg: 50, reps: 8, set_type: 'heavy' });
  });

  it('numbers only the working sets', () => {
    expect(setNumberLabels([set(40, 10, 'warmup'), set(60, 5, 'warmup'), set(80, 6, 'heavy'), set(80, 5)])).toEqual(['C', 'C', '1', '2']);
    expect(workingSets([set(40, 10, 'warmup'), set(80, 6)])).toHaveLength(1);
  });

  it('keeps an exercise pending until its working sets are done', () => {
    expect(isPending(exercise({ target_sets: 2, sets: [set(40, 10, 'warmup'), set(80, 6)] }))).toBe(true);
    expect(isPending(exercise({ target_sets: 2, sets: [set(40, 10, 'warmup'), set(80, 6), set(80, 6)] }))).toBe(false);
    expect(isPending(exercise({ target_sets: null, sets: [set(40, 10, 'warmup')] }))).toBe(true);
    expect(isPending(exercise({ target_sets: null, sets: [set(80, 6)] }))).toBe(false);
  });

  it('rests at most a minute after a warm-up', () => {
    expect(WARMUP_REST_SECONDS).toBe(60);
    expect(restAfter(set(40, 10, 'warmup'), 180)).toBe(60);
    expect(restAfter(set(40, 10, 'warmup'), 45)).toBe(45);
    expect(restAfter(set(80, 6, 'heavy'), 180)).toBe(180);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (funciones no exportadas).

- [ ] **Step 3: Implement** en `set-suggestions.ts`:

Ampliar el import de modelos: `import type { SetType, WorkoutSet } from '../models/exercise';`

Agregar (antes de `suggestNextSet`):

```ts
/** Tras un calentamiento basta un minuto (o menos, si la rutina descansa menos). */
export const WARMUP_REST_SECONDS = 60;

export function isWarmup(set: { set_type: SetType }): boolean {
  return set.set_type === 'warmup';
}

/** Series efectivas: todo lo que no es calentamiento. */
export function workingSets<T extends { set_type: SetType }>(sets: T[]): T[] {
  return sets.filter((s) => !isWarmup(s));
}

/** Etiqueta de cada fila: "C" para calentamientos; las efectivas se numeran 1..n saltándolos. */
export function setNumberLabels(sets: { set_type: SetType }[]): string[] {
  let n = 0;
  return sets.map((s) => (isWarmup(s) ? 'C' : String(++n)));
}

/** Ejercicio pendiente: aún no completa sus series efectivas objetivo (o, sin objetivo, no tiene ninguna). */
export function isPending(item: SessionExercise): boolean {
  const done = workingSets(item.sets).length;
  return item.target_sets === null ? done === 0 : done < item.target_sets;
}

export function restAfter(set: { set_type: SetType }, restSeconds: number): number {
  return isWarmup(set) ? Math.min(restSeconds, WARMUP_REST_SECONDS) : restSeconds;
}
```

Reemplazar `suggestNextSet` por:

```ts
/**
 * Valores iniciales de la próxima serie: la anterior de hoy, o la primera efectiva de la última vez.
 * Tras un calentamiento se vuelve al tipo de la rutina y a la carga efectiva de la última vez.
 */
export function suggestNextSet(item: SessionExercise): WorkoutSetInput {
  const lastHere = item.sets.at(-1);
  const previous = item.last_performance?.sets;
  if (lastHere && !isWarmup(lastHere)) {
    return { ...toSetInput(lastHere), pain_level: null, notes: null };
  }
  if (lastHere) {
    const working = previous?.find((s) => !isWarmup(s));
    return {
      weight_kg: working?.weight_kg ?? lastHere.weight_kg,
      reps: working?.reps ?? lastHere.reps,
      set_type: item.default_set_type,
      side: lastHere.side,
      rir: null,
      pain_level: null,
      notes: null,
    };
  }
  const reference = previous?.find((s) => !isWarmup(s)) ?? previous?.[0];
  return {
    weight_kg: reference?.weight_kg ?? 0,
    reps: reference?.reps ?? item.target_reps_max ?? item.target_reps_min ?? 10,
    set_type: item.default_set_type,
    side: 'both',
    rir: null,
    pain_level: null,
    notes: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS (incluye los tests previos de `suggestNextSet`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/workout/set-suggestions.ts frontend/src/app/core/workout/set-suggestions.spec.ts
git commit -m "feat(workout): warm-up helpers: working sets, numbering, pending and rest"
```

---

### Task 2: Chip "Calentamiento", lista y descanso en la tarjeta

**Files:**
- Modify: `frontend/src/app/features/workout/exercise-card.ts`
- Modify: `frontend/src/app/features/workout/workout-page.ts:28-31` (usar `isPending` compartido)
- Test: `frontend/src/app/features/workout/exercise-card.spec.ts`

**Interfaces:**
- Consumes (Task 1): `isWarmup`, `workingSets`, `setNumberLabels`, `isPending`, `restAfter` desde `core/workout/set-suggestions`.

- [ ] **Step 1: Write the failing tests** — agregar en `exercise-card.spec.ts`, dentro del `describe('ExerciseCard')`:

```ts
  it('saves a warm-up with the chip and rests at most a minute, announcing the first working set', async () => {
    const { el, fixture, sessions, timer } = await render();
    const chip = button(el, 'Calentamiento');
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    chip.click();
    await fixture.whenStable();
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    button(el, 'Guardar serie').click();
    await fixture.whenStable();

    expect(sessions.addSet).toHaveBeenCalledWith('we1', expect.objectContaining({ set_type: 'warmup' }));
    expect(timer.start).toHaveBeenCalledWith(60, {
      body: 'Press de banca · serie 1 de 1',
      url: '/entrenamiento/w1',
    });
  });

  it('turning the chip off goes back to the routine set type', async () => {
    const { el, fixture, sessions } = await render();
    button(el, 'Calentamiento').click();
    await fixture.whenStable();
    button(el, 'Calentamiento').click();
    await fixture.whenStable();
    button(el, 'Guardar serie').click();
    await fixture.whenStable();

    expect(sessions.addSet).toHaveBeenCalledWith('we1', expect.objectContaining({ set_type: 'bilbo' }));
  });

  it('labels warm-ups with C and numbers only the working sets', async () => {
    const warm = { ...item.last_performance!.sets[0], id: 'a', set_type: 'warmup' as const, weight_kg: 20 };
    const work = { ...item.last_performance!.sets[0], id: 'b', set_number: 2 };
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkoutSessionService, useValue: { session: () => ({ id: 'w1' }) } },
        { provide: RestTimerService, useValue: { start: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ExerciseCard);
    fixture.componentRef.setInput('item', { ...item, sets: [warm, work] });
    await fixture.whenStable();

    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('ol li'));
    expect(rows.map((r) => r.querySelector('.set-number')?.textContent?.trim())).toEqual(['C', '1']);
    expect(rows[0].classList).toContain('opacity-60');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (no existe el botón "Calentamiento" ni `.set-number`).

- [ ] **Step 3: Implement** en `exercise-card.ts`:

Ampliar el import de `set-suggestions` con `isWarmup, restAfter, setNumberLabels, workingSets`.

En la lista de series, agregar al `<li>` la clase condicional `[class.opacity-60]="isWarmup(set)"` y reemplazar
`<span class="w-5 text-base text-muted-foreground">{{ i + 1 }}</span>` por:

```html
                <span class="set-number w-5 text-base text-muted-foreground">{{ numberLabels()[i] }}</span>
```

Antes de `<div class="mt-3 flex gap-2">` (fila Más / Copiar / Guardar), agregar el chip:

```html
      <button
        type="button"
        class="mt-3 h-12 rounded-full border px-4 text-base font-semibold tracking-wide uppercase"
        [attr.aria-pressed]="warmup()"
        [class.bg-primary]="warmup()"
        [class.border-primary]="warmup()"
        [class.text-primary-foreground]="warmup()"
        [class.border-border]="!warmup()"
        [class.text-muted-foreground]="!warmup()"
        (click)="toggleWarmup()"
      >
        Calentamiento
      </button>
```

En la clase, junto a los demás `protected readonly`:

```ts
  protected readonly isWarmup = isWarmup;
  protected readonly numberLabels = computed(() => setNumberLabels(this.item().sets));
  protected readonly warmup = computed(() => isWarmup(this.entry()));
```

Y el método:

```ts
  protected toggleWarmup(): void {
    this.patch({ set_type: this.warmup() ? this.item().default_set_type : 'warmup' });
  }
```

En `save()`, reemplazar el bloque que arranca el temporizador (desde `const saved = …` hasta el final del `if (!this.finished())`) por:

```ts
    const workingBefore = workingSets(this.item().sets).length;
    const saved = await this.sessions.addSet(this.item().id, input);
    this.celebrate(saved?.id ?? null);
    if (!this.finished()) {
      const ex = this.item();
      // La próxima efectiva: tras un calentamiento sigue siendo la misma.
      const next = workingBefore + (isWarmup(input) ? 0 : 1) + 1;
      const sessionId = this.sessions.session()?.id;
      this.timer.start(
        restAfter(input, ex.rest_seconds),
        sessionId
          ? { body: restNoticeBody(ex.exercise.name, next, ex.target_sets), url: `/entrenamiento/${sessionId}` }
          : undefined,
      );
    }
```

Nota: con calentamiento, `next = workingBefore + 1` (la efectiva pendiente); con efectiva, `next = workingBefore + 2` (la siguiente a la recién hecha).

En `workout-page.ts`, borrar la función local `isPending` (líneas 28-31) e importarla: cambiar `import { parseDecimal } from '../../core/workout/set-suggestions';` por `import { isPending, parseDecimal } from '../../core/workout/set-suggestions';`.

- [ ] **Step 4: Run tests and build**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build sin errores. El test previo "prefills from last time…" debe seguir esperando `timer.start(180, { body: 'Press de banca · serie 2', … })`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/workout/exercise-card.ts frontend/src/app/features/workout/exercise-card.spec.ts frontend/src/app/features/workout/workout-page.ts
git commit -m "feat(workout): one-tap warm-up chip, C labels and short rest after warm-ups"
```

---

### Task 3: Revisión de Luciano

- [ ] Levantar `docker compose up -d` y `cd frontend && npx ng serve --port 4200`; login `luciano@gymtracker.test` / `password`.
- [ ] Él prueba en un entreno: chip, "C" en la lista, sugerencia tras calentar, descanso de 60 s.
- [ ] Con su OK: "intégralo a main".
