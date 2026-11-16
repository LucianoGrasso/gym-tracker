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
