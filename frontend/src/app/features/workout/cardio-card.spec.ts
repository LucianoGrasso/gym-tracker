import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { WorkoutSet } from '../../core/models/exercise';
import type { SessionExercise } from '../../core/models/workout';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { CardioCard } from './cardio-card';

const segment = (extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: 's1', set_number: 1, set_type: 'normal', weight_kg: 0, reps: 0, side: 'both', rir: null, pain_level: null, notes: null,
  duration_seconds: 2100, speed_kmh: 5.5, incline_pct: 12, distance_km: 3.2, avg_heart_rate: null, calories: null, ...extra,
});

const walk: SessionExercise = {
  id: 'we1', exercise: { id: 1, name: 'Caminata inclinada en trotadora', uses_bodyweight: false, is_unilateral: false, kind: 'cardio' },
  position: 0, target_sets: 1, target_reps_min: null, target_reps_max: null, target_text: '35 min · 12 %',
  default_set_type: 'normal', rest_seconds: 0, notes: null,
  last_performance: { workout_id: 'w0', date: '2026-11-12', sets: [segment()] }, sets: [],
};

async function render(data: SessionExercise = walk) {
  const sessions = { addSet: vi.fn().mockResolvedValue({ id: 'new' }), updateSet: vi.fn(), deleteSet: vi.fn(), removeExercise: vi.fn() };
  const timer = { start: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkoutSessionService, useValue: sessions },
      { provide: RestTimerService, useValue: timer },
    ],
  });
  const fixture = TestBed.createComponent(CardioCard);
  fixture.componentRef.setInput('item', data);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.getAttribute('aria-label') === label || b.textContent!.trim() === label,
    )!;
  return { fixture, el, sessions, timer, button };
}

describe('CardioCard', () => {
  it('shows the targets and last time', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('1 tramo · 35 min · 12 %');
    expect(el.textContent).toContain('Última vez: Total: 35 min · 3,2 km · 12/11/2026');
  });

  it('prefills from last time, steps the values and saves a segment without starting the rest timer', async () => {
    const { fixture, el, sessions, timer, button } = await render();
    expect(el.querySelector<HTMLInputElement>('[aria-label="Duración (min)"]')!.value).toBe('35');

    button('Sumar 1 min').click();
    button('Sumar 0,5 km/h').click();
    button('Restar 0,5 %').click();
    await fixture.whenStable();
    button('Guardar tramo').click();
    await fixture.whenStable();

    expect(sessions.addSet).toHaveBeenCalledWith('we1', expect.objectContaining({
      duration_seconds: 2160, speed_kmh: 6, incline_pct: 11.5, weight_kg: 0, reps: 0, set_type: 'normal', side: 'both',
    }));
    expect(timer.start).not.toHaveBeenCalled();
  });

  it('lists the segments with a total', async () => {
    const { el } = await render({
      ...walk,
      sets: [segment({ id: 'a', duration_seconds: 600, distance_km: 1 }), segment({ id: 'b', duration_seconds: 300, distance_km: 0.5 })],
    });
    expect(el.textContent).toContain('10 min · 5,5 km/h · 12 % · 1 km');
    expect(el.textContent).toContain('Total: 15 min · 1,5 km');
  });

  it('records distance, heart rate and calories without extra taps', async () => {
    const { fixture, el, sessions, button } = await render();
    expect(button('Más')).toBeUndefined();
    const hr = el.querySelector<HTMLInputElement>('[aria-label="FC promedio"]')!;
    hr.value = '128';
    hr.dispatchEvent(new Event('change'));
    button('Guardar tramo').click();
    await fixture.whenStable();
    expect(sessions.addSet).toHaveBeenCalledWith('we1', expect.objectContaining({ avg_heart_rate: 128 }));
  });
});
