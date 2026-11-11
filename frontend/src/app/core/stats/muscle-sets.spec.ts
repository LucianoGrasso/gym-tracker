import { describe, expect, it } from 'vitest';
import type { MuscleSetsEntry } from '../models/stats';
import { formatMuscleDetail, muscleColor, muscleIntensity, rankMuscles } from './muscle-sets';

const entry = (muscle: MuscleSetsEntry['muscle'], sets_per_week: number, status: MuscleSetsEntry['status']): MuscleSetsEntry => ({
  muscle,
  sets: Math.round(sets_per_week * 4),
  sets_per_week,
  status,
});

describe('muscleIntensity', () => {
  it('grows with the weekly sets and saturates at the top of the range', () => {
    expect(muscleIntensity(0)).toBe(0);
    expect(muscleIntensity(10)).toBe(0.5);
    expect(muscleIntensity(20)).toBe(1);
    expect(muscleIntensity(35)).toBe(1);
  });
});

describe('muscleColor', () => {
  it('goes from the empty surface to lime, and any set is visible', () => {
    expect(muscleColor(0)).toBe('#2a2d25');
    expect(muscleColor(1)).toBe('#c8f135');
    expect(muscleColor(0.05)).not.toBe('#2a2d25');
  });
});

describe('formatMuscleDetail', () => {
  it('describes the weekly sets against the 10–20 range', () => {
    expect(formatMuscleDetail(entry('quads', 11.8, 'in_range'))).toBe('Cuádriceps · 11,8 series/sem · en rango (10–20)');
    expect(formatMuscleDetail(entry('lats', 4, 'low'))).toBe('Dorsales · 4 series/sem · bajo el rango (10–20)');
    expect(formatMuscleDetail(entry('chest', 22.5, 'high'))).toBe('Pecho · 22,5 series/sem · sobre el rango (10–20)');
    expect(formatMuscleDetail(entry('calves', 0, 'none'))).toBe('Gemelos · sin series en el período');
  });
});

describe('rankMuscles', () => {
  it('sorts by weekly sets, keeps untrained muscles last and hides an empty "other"', () => {
    const ranked = rankMuscles([
      entry('chest', 8, 'low'),
      entry('lats', 0, 'none'),
      entry('quads', 12, 'in_range'),
      entry('calves', 0, 'none'),
      entry('other', 0, 'none'),
    ]);

    expect(ranked.map((m) => m.muscle)).toEqual(['quads', 'chest', 'lats', 'calves']);
    expect(rankMuscles([entry('other', 2, 'low')]).map((m) => m.muscle)).toEqual(['other']);
  });
});
