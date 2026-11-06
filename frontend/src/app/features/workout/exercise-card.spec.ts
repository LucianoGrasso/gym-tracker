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

async function render(finished = false) {
  const sessions = {
    addSet: vi.fn().mockResolvedValue(undefined),
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
  fixture.componentRef.setInput('item', item);
  fixture.componentRef.setInput('finished', finished);
  await fixture.whenStable();
  return { fixture, sessions, timer, el: fixture.nativeElement as HTMLElement };
}

const button = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;

describe('ExerciseCard', () => {
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
    expect(timer.start).toHaveBeenCalledWith(180);
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
