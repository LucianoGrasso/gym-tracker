import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from '../models/exercise';
import { formatBestSet, formatRest, formatTargets } from './training';

const set = (weight_kg: number, reps: number, set_type: WorkoutSet['set_type'] = 'normal'): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type, weight_kg, reps, side: 'both', rir: null, pain_level: null, notes: null,
});

describe('formatTargets', () => {
  it('shows sets and a reps range', () => {
    expect(formatTargets({ target_sets: 3, target_reps_min: 8, target_reps_max: 12 })).toBe('3 × 8-12');
  });
  it('collapses an exact reps target', () => {
    expect(formatTargets({ target_sets: 5, target_reps_min: 5, target_reps_max: 5 })).toBe('5 × 5');
  });
  it('uses the single bound present', () => {
    expect(formatTargets({ target_sets: 3, target_reps_min: null, target_reps_max: 10 })).toBe('3 × 10');
  });
  it('falls back to the number of sets', () => {
    expect(formatTargets({ target_sets: 1, target_reps_min: null, target_reps_max: null })).toBe('1 serie');
    expect(formatTargets({ target_sets: 3, target_reps_min: null, target_reps_max: null })).toBe('3 series');
  });
});

describe('formatBestSet', () => {
  it('picks the heaviest non-warmup set, then the most reps', () => {
    expect(formatBestSet([set(60, 5, 'warmup'), set(42.5, 28), set(42.5, 31)], false)).toBe('42,5 kg × 31');
  });
  it('shows reps only for bodyweight without extra load', () => {
    expect(formatBestSet([set(0, 6), set(0, 4)], true)).toBe('6 reps');
  });
  it('shows extra load for weighted bodyweight sets', () => {
    expect(formatBestSet([set(10, 5)], true)).toBe('+10 kg × 5');
  });
  it('returns null without sets', () => {
    expect(formatBestSet([], false)).toBeNull();
  });
});

describe('formatRest', () => {
  it('formats seconds as m:ss', () => {
    expect(formatRest(150)).toBe('2:30 min');
    expect(formatRest(90)).toBe('1:30 min');
    expect(formatRest(45)).toBe('0:45 min');
  });
});
