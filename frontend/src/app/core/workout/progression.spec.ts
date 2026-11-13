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
    const unknown = exercise(threeAtTop);
    delete unknown.exercise.equipment;
    expect(suggestProgression(unknown)).toBeNull();
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
