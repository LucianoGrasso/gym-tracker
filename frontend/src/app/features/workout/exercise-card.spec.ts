import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { SessionExercise } from '../../core/models/workout';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { ExerciseCard } from './exercise-card';

const item: SessionExercise = {
  id: 'we1',
  exercise: { id: 1, name: 'Press de banca', uses_bodyweight: false, is_unilateral: false },
  position: 0,
  target_sets: 1,
  target_reps_min: null,
  target_reps_max: null,
  target_text: '~30 reps',
  default_set_type: 'bilbo',
  rest_seconds: 180,
  notes: null,
  last_performance: {
    workout_id: 'w0',
    date: '2026-10-26',
    sets: [
      {
        id: 's0',
        set_number: 1,
        set_type: 'bilbo',
        weight_kg: 42.5,
        reps: 31,
        side: 'both',
        rir: null,
        pain_level: null,
        notes: null,
      },
    ],
  },
  sets: [],
};

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

async function render(finished = false, data: SessionExercise = item) {
  const sessions = {
    addSet: vi.fn().mockResolvedValue(undefined),
    session: () => ({ id: 'w1' }),
    updateSet: vi.fn(),
    deleteSet: vi.fn(),
    removeExercise: vi.fn(),
  };
  const timer = { start: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkoutSessionService, useValue: sessions },
      { provide: RestTimerService, useValue: timer },
    ],
  });
  const fixture = TestBed.createComponent(ExerciseCard);
  fixture.componentRef.setInput('item', data);
  fixture.componentRef.setInput('finished', finished);
  await fixture.whenStable();
  return { fixture, sessions, timer, el: fixture.nativeElement as HTMLElement };
}

const button = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;

describe('ExerciseCard', () => {
  it('suggests the next weight and prefills it', async () => {
    const { el, fixture, sessions } = await render(false, dumbbellPress);
    expect(el.textContent).toContain('📈 ¡Sube a 26,5 kg!');
    expect(el.textContent).toContain('La última vez: 3×12 con 24 kg');

    button(el, 'Guardar serie').click();
    await fixture.whenStable();
    expect(sessions.addSet).toHaveBeenCalledWith('we2', expect.objectContaining({ weight_kg: 26.5, reps: 8 }));
  });

  it('keeps last time\'s weight when asked', async () => {
    const { el, fixture, sessions } = await render(false, dumbbellPress);
    button(el, 'Mantener 24 kg').click();
    await fixture.whenStable();
    expect(el.textContent).not.toContain('¡Sube a 26,5 kg!');

    button(el, 'Guardar serie').click();
    await fixture.whenStable();
    expect(sessions.addSet).toHaveBeenCalledWith('we2', expect.objectContaining({ weight_kg: 24, reps: 12 }));
  });

  it('hides the suggestion once a working set is logged today', async () => {
    const logged = { ...dumbbellPress.last_performance!.sets[0], id: 't1', weight_kg: 26.5, reps: 9 };
    const { el } = await render(false, { ...dumbbellPress, sets: [logged] });
    expect(el.textContent).not.toContain('¡Sube a 26,5 kg!');
  });

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

  it('shows last time and the bilbo target', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('Última vez: 42,5 kg × 31 · 26/10/2026');
    expect(el.textContent).toContain('Objetivo Bilbo: 32 reps');
  });

  it('prefills from last time, steps the weight and saves the set starting the rest timer', async () => {
    const { el, fixture, sessions, timer } = await render();

    button(el, '+').click();
    await fixture.whenStable();
    button(el, 'Guardar serie').click();
    await fixture.whenStable();

    expect(sessions.addSet).toHaveBeenCalledWith('we1', {
      weight_kg: 45,
      reps: 31,
      set_type: 'bilbo',
      side: 'both',
      rir: null,
      pain_level: null,
      notes: null,
    });
    expect(timer.start).toHaveBeenCalledWith(180, {
      body: 'Press de banca · serie 2',
      url: '/entrenamiento/w1',
    });
  });

  it('highlights the saved set and confirms it on the button', async () => {
    const { el, fixture, sessions } = await render();
    const saved = { ...item.last_performance!.sets[0], id: 's1' };
    sessions.addSet.mockResolvedValue(saved);

    button(el, 'Guardar serie').click();
    await fixture.whenStable();
    fixture.componentRef.setInput('item', { ...item, sets: [saved] });
    fixture.detectChanges();

    expect(el.querySelector('ol li')?.classList).toContain('set-saved');
    expect(el.textContent).toContain('✓ Guardada');
  });

  it('does not start the timer when editing a finished session', async () => {
    const { el, fixture, timer } = await render(true);
    button(el, 'Guardar serie').click();
    await fixture.whenStable();
    expect(timer.start).not.toHaveBeenCalled();
  });
});
