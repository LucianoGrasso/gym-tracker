import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from '../models/exercise';
import type { SessionExercise } from '../models/workout';
import { endedLabel, flowState, moveBefore } from './session-flow';

const set = (set_type: WorkoutSet['set_type'] = 'normal'): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type, weight_kg: 40, reps: 10, side: 'both', rir: null, pain_level: null, notes: null,
});

const item = (id: string, position: number, overrides: Partial<SessionExercise> = {}): SessionExercise => ({
  id, exercise: { id: position + 1, name: id, uses_bodyweight: false, is_unilateral: false }, position,
  target_sets: 4, target_reps_min: 8, target_reps_max: 12, target_text: null, default_set_type: 'normal',
  rest_seconds: 120, notes: null, last_performance: null, sets: [], ...overrides,
});

describe('moveBefore', () => {
  it('moves an exercise before another and renumbers the positions', () => {
    const list = [item('a', 0), item('b', 1), item('c', 2), item('d', 3)];
    const moved = moveBefore(list, 'd', 'b');
    expect(moved.map((e) => e.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(moved.map((e) => e.position)).toEqual([0, 1, 2, 3]);
  });
  it('leaves the list as it is when the ids are unknown or equal', () => {
    const list = [item('a', 0), item('b', 1)];
    expect(moveBefore(list, 'a', 'a').map((e) => e.id)).toEqual(['a', 'b']);
    expect(moveBefore(list, 'x', 'a').map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('endedLabel', () => {
  it('counts working sets against the target', () => {
    expect(endedLabel(item('a', 0, { sets: [set('warmup'), set(), set()] }))).toBe('Terminado · 2 de 4');
  });
  it('counts sets without a target and segments for cardio', () => {
    expect(endedLabel(item('a', 0, { target_sets: null, sets: [set()] }))).toBe('Terminado · 1 serie');
    expect(endedLabel(item('a', 0, { target_sets: null, sets: [] }))).toBe('Terminado · 0 series');
    const cardio = item('c', 0, { exercise: { id: 9, name: 'Trote', uses_bodyweight: false, is_unilateral: false, kind: 'cardio' }, sets: [set()] });
    expect(endedLabel(cardio)).toBe('Terminado · 1 tramo');
  });
});

describe('flowState', () => {
  it('tells what each exercise of the active session offers', () => {
    expect(flowState(item('a', 0, { ended_early: true }), 'b', true)).toBe('ended');
    expect(flowState(item('b', 1), 'b', true)).toBe('current');
    expect(flowState(item('c', 2), 'b', true)).toBe('waiting');
    expect(flowState(item('d', 3, { sets: [set(), set(), set(), set()] }), 'b', true)).toBe('none');
  });
  it('offers nothing in a finished session', () => {
    expect(flowState(item('a', 0, { ended_early: true }), null, false)).toBe('none');
    expect(flowState(item('b', 1), null, false)).toBe('none');
  });
});
