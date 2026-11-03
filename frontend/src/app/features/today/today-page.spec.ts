import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { TodayApi } from '../../core/api/today-api';
import type { Today } from '../../core/models/routine';
import { TodayPage } from './today-page';

const bench = {
  id: 1, name: 'Press de banca', muscle_group: 'chest' as const, equipment: 'barbell' as const,
  is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
};

const today: Today = {
  date: '2026-11-02',
  weekday: 1,
  routine: { id: 1, name: 'Rutina 4 días' },
  day: {
    id: 10, routine_id: 1, name: 'Lunes – Pecho (Bilbo)', weekday: 1, position: 0,
    exercises: [{
      id: 100, routine_day_id: 10, exercise: bench, position: 0, target_sets: 1, target_reps_min: null,
      target_reps_max: null, target_text: '~30 reps explosivas, 40-45 kg', default_set_type: 'bilbo',
      rest_seconds: 180, notes: null,
      last_performance: {
        workout_id: 'w1', date: '2026-10-26',
        sets: [{ id: 's1', set_number: 1, set_type: 'bilbo', weight_kg: 42.5, reps: 30, side: 'both', rir: null, pain_level: null, notes: null }],
      },
    }],
  },
  days: [{ id: 10, name: 'Lunes – Pecho (Bilbo)', weekday: 1 }],
};

async function render(data: Today) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: TodayApi, useValue: { get: () => Promise.resolve(data) } }],
  });
  const fixture = TestBed.createComponent(TodayPage);
  await fixture.whenStable();
  return fixture.nativeElement.textContent as string;
}

describe('TodayPage', () => {
  it('shows the day, its targets and the last performance', async () => {
    const text = await render(today);
    expect(text).toContain('Lunes 02/11/2026');
    expect(text).toContain('Lunes – Pecho (Bilbo)');
    expect(text).toContain('Press de banca');
    expect(text).toContain('~30 reps explosivas, 40-45 kg');
    expect(text).toContain('Última vez: 42,5 kg × 30 · 26/10/2026');
  });

  it('shows a rest day with the available days', async () => {
    const text = await render({ ...today, weekday: 3, date: '2026-11-04', day: null });
    expect(text).toContain('Hoy es día de descanso');
    expect(text).toContain('Lunes – Pecho (Bilbo)');
  });

  it('invites to activate a routine when there is none', async () => {
    const text = await render({ ...today, routine: null, day: null, days: [] });
    expect(text).toContain('No tienes una rutina activa');
  });
});
