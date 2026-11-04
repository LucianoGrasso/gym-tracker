import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from '../models/exercise';
import type { SessionExercise } from '../models/workout';
import { bilboHint, formatNumber, formatSetLine, parseDecimal, stepReps, stepWeight, suggestNextSet } from './set-suggestions';

const set = (weight_kg: number, reps: number, set_type: WorkoutSet['set_type'] = 'normal', extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type, weight_kg, reps, side: 'both', rir: null, pain_level: null, notes: null, ...extra,
});

const exercise = (overrides: Partial<SessionExercise> = {}): SessionExercise => ({
  id: 'we', exercise: { id: 1, name: 'Press', uses_bodyweight: false, is_unilateral: false }, position: 0,
  target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_text: null, default_set_type: 'normal',
  rest_seconds: 120, notes: null, last_performance: null, sets: [], ...overrides,
});

describe('suggestNextSet', () => {
  it('copies the last set of this session without notes or pain', () => {
    const s = suggestNextSet(exercise({ sets: [set(30, 10, 'normal', { side: 'left', pain_level: 4, notes: 'x', rir: 2 })] }));
    expect(s).toEqual({ weight_kg: 30, reps: 10, set_type: 'normal', side: 'left', rir: 2, pain_level: null, notes: null });
  });
  it('uses the first working set of last time when the session has no sets', () => {
    const s = suggestNextSet(exercise({
      last_performance: { workout_id: 'w', date: '2026-10-26', sets: [set(20, 10, 'warmup'), set(42.5, 30, 'bilbo')] },
      default_set_type: 'bilbo',
    }));
    expect(s).toMatchObject({ weight_kg: 42.5, reps: 30, set_type: 'bilbo' });
  });
  it('falls back to the target reps', () => {
    expect(suggestNextSet(exercise())).toMatchObject({ weight_kg: 0, reps: 12, set_type: 'normal' });
  });
});

describe('steppers and parsing', () => {
  it('steps weight by 2.5 kg and never below zero', () => {
    expect(stepWeight(40, 2.5)).toBe(42.5);
    expect(stepWeight(1, -2.5)).toBe(0);
  });
  it('steps reps by one and never below zero', () => {
    expect(stepReps(5, 1)).toBe(6);
    expect(stepReps(0, -1)).toBe(0);
  });
  it('parses decimals with comma or point', () => {
    expect(parseDecimal('42,5', 0)).toBe(42.5);
    expect(parseDecimal('30.25', 0)).toBe(30.25);
    expect(parseDecimal('abc', 7)).toBe(7);
    expect(parseDecimal('-3', 7)).toBe(7);
  });
  it('formats numbers with a decimal comma', () => {
    expect(formatNumber(42.5)).toBe('42,5');
    expect(formatNumber(40)).toBe('40');
  });
});

describe('bilboHint', () => {
  it('targets one more rep than the best bilbo set last time', () => {
    const hint = bilboHint(exercise({
      default_set_type: 'bilbo',
      last_performance: { workout_id: 'w', date: 'd', sets: [set(42.5, 31, 'bilbo')] },
    }));
    expect(hint).toEqual({ target: 32, suggestIncrease: false });
  });
  it('suggests increasing the load from 35 reps', () => {
    expect(bilboHint(exercise({ default_set_type: 'bilbo', sets: [set(42.5, 36, 'bilbo')] })).suggestIncrease).toBe(true);
  });
  it('is empty for non bilbo exercises', () => {
    expect(bilboHint(exercise())).toEqual({ target: null, suggestIncrease: false });
  });
});

describe('formatSetLine', () => {
  it('describes a set', () => {
    expect(formatSetLine(set(42.5, 30, 'bilbo'), false)).toBe('42,5 kg × 30 · Bilbo');
    expect(formatSetLine(set(0, 6), true)).toBe('6 reps');
    expect(formatSetLine(set(10, 5, 'normal', { side: 'right', pain_level: 3 }), true)).toBe('+10 kg × 5 · der. · molestia 3');
  });
});
