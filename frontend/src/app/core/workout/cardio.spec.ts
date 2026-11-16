import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from '../models/exercise';
import type { SessionExercise } from '../models/workout';
import {
  formatCardioTotal, formatDuration, formatSegmentLine, formatSegments, isCardio, stepHalf, stepMinutes, suggestNextSegment,
} from './cardio';

const segment = (extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type: 'normal', weight_kg: 0, reps: 0, side: 'both',
  rir: null, pain_level: null, notes: null, duration_seconds: 2100, speed_kmh: 5.5, incline_pct: 12,
  distance_km: null, avg_heart_rate: null, calories: null, ...extra,
});

const walk = (overrides: Partial<SessionExercise> = {}): SessionExercise => ({
  id: 'we', exercise: { id: 1, name: 'Caminata inclinada', uses_bodyweight: false, is_unilateral: false, kind: 'cardio' },
  position: 0, target_sets: 1, target_reps_min: null, target_reps_max: null, target_text: '35 min · 12 %',
  default_set_type: 'normal', rest_seconds: 0, notes: null, last_performance: null, sets: [], ...overrides,
});

const blank = { weight_kg: 0, reps: 0, set_type: 'normal', side: 'both', rir: null, pain_level: null, notes: null };

describe('isCardio', () => {
  it('treats a missing kind as strength', () => {
    expect(isCardio({ kind: 'cardio' })).toBe(true);
    expect(isCardio({ kind: 'strength' })).toBe(false);
    expect(isCardio({})).toBe(false);
  });
});

describe('suggestNextSegment', () => {
  it('copies duration, speed and incline of the previous segment today', () => {
    const s = suggestNextSegment(walk({ sets: [segment({ duration_seconds: 300, speed_kmh: 8, incline_pct: 1, distance_km: 0.7, avg_heart_rate: 150 })] }));
    expect(s).toEqual({ ...blank, duration_seconds: 300, speed_kmh: 8, incline_pct: 1, distance_km: null, avg_heart_rate: null, calories: null });
  });
  it('uses the first segment of last time', () => {
    const s = suggestNextSegment(walk({ last_performance: { workout_id: 'w', date: '2026-11-12', sets: [segment(), segment({ speed_kmh: 6 })] } }));
    expect(s).toMatchObject({ duration_seconds: 2100, speed_kmh: 5.5, incline_pct: 12 });
  });
  it('starts at 30 minutes without history', () => {
    expect(suggestNextSegment(walk())).toEqual({
      ...blank, duration_seconds: 1800, speed_kmh: null, incline_pct: null, distance_km: null, avg_heart_rate: null, calories: null,
    });
  });
});

describe('steppers', () => {
  it('steps minutes and never goes under one minute', () => {
    expect(stepMinutes(1800, 1)).toBe(1860);
    expect(stepMinutes(60, -1)).toBe(60);
  });
  it('steps by halves from empty and never below zero', () => {
    expect(stepHalf(null, 0.5)).toBe(0.5);
    expect(stepHalf(5.5, 0.5)).toBe(6);
    expect(stepHalf(0, -0.5)).toBe(0);
  });
});

describe('formatting', () => {
  it('formats durations in minutes', () => {
    expect(formatDuration(2100)).toBe('35 min');
    expect(formatDuration(2130)).toBe('35:30 min');
  });
  it('lists only the fields present', () => {
    expect(formatSegmentLine(segment())).toBe('35 min · 5,5 km/h · 12 %');
    expect(formatSegmentLine(segment({ speed_kmh: null, incline_pct: null, distance_km: 3.2, avg_heart_rate: 128, calories: 250 })))
      .toBe('35 min · 3,2 km · FC 128 · 250 kcal');
  });
  it('totals duration and distance', () => {
    expect(formatCardioTotal([segment({ duration_seconds: 600 }), segment({ duration_seconds: 300 })])).toBe('Total: 15 min');
    expect(formatCardioTotal([segment({ distance_km: 1.5 }), segment({ distance_km: 1.7 })])).toBe('Total: 70 min · 3,2 km');
  });
  it('names segments', () => {
    expect(formatSegments(1)).toBe('1 tramo');
    expect(formatSegments(3)).toBe('3 tramos');
  });
});
