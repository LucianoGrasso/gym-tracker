import { describe, expect, it } from 'vitest';
import type { ExerciseSessionStats } from '../../core/models/stats';
import { EXERCISE_METRICS, bilboPoints } from './exercise-stats-page';

const session = (date: string, bilbo: ExerciseSessionStats['bilbo']): ExerciseSessionStats => ({
  workout_id: date,
  date,
  e1rm_kg: null,
  best_load_kg: null,
  best_load_reps: null,
  volume_kg: 0,
  total_reps: 0,
  bilbo,
});

describe('exercise stats helpers', () => {
  it('offers the four metrics of the spec, one at a time', () => {
    expect(EXERCISE_METRICS.map((m) => m.label)).toEqual(['1RM estimado', 'Mejor peso', 'Volumen', 'Reps totales']);
  });

  it('takes the best bilbo set of each session that had one', () => {
    expect(
      bilboPoints([
        session('2026-10-01', [
          { load_kg: 42.5, reps: 30 },
          { load_kg: 42.5, reps: 28 },
        ]),
        session('2026-10-08', []),
        session('2026-10-15', [{ load_kg: 45, reps: 31 }]),
      ]),
    ).toEqual([
      { date: '2026-10-01', value: 30 },
      { date: '2026-10-15', value: 31 },
    ]);
  });
});
