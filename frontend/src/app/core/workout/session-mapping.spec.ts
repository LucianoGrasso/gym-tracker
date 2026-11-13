import { describe, expect, it } from 'vitest';
import type { Today } from '../models/routine';
import type { WorkoutDetail } from '../models/workout';
import { freeSession, sessionFromDay, sessionFromDetail, setPayload, workoutExercisePayload, workoutPayload } from './session-mapping';

const bench = {
  id: 1, name: 'Press de banca', muscle_group: 'chest' as const, secondary_muscles: [], equipment: 'barbell' as const,
  is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
};

const today: Today = {
  date: '2026-11-02', weekday: 1, routine: { id: 1, name: 'Rutina' },
  day: {
    id: 10, routine_id: 1, name: 'Lunes – Pecho', weekday: 1, position: 0,
    exercises: [{
      id: 100, routine_day_id: 10, exercise: bench, position: 0, target_sets: 1, target_reps_min: null,
      target_reps_max: null, target_text: '~30', default_set_type: 'bilbo', rest_seconds: 180, notes: null,
      last_performance: null,
    }],
  },
  days: [],
};

describe('session mapping', () => {
  it('builds a session from the routine day, copying the targets', () => {
    let n = 0;
    const session = sessionFromDay(today, () => `id${n++}`, '2026-11-02T22:00:00.000Z');

    expect(session).toEqual({
      id: 'id0', routine_day_id: 10, name: 'Lunes – Pecho', date: '2026-11-02',
      started_at: '2026-11-02T22:00:00.000Z', finished_at: null, bodyweight_kg: null, notes: null,
      exercises: [{
        id: 'id1', exercise: { id: 1, name: 'Press de banca', uses_bodyweight: false, is_unilateral: false, equipment: 'barbell' },
        position: 0, target_sets: 1, target_reps_min: null, target_reps_max: null, target_text: '~30',
        default_set_type: 'bilbo', rest_seconds: 180, notes: null, last_performance: null, sets: [],
      }],
    });
  });

  it('builds an empty free session', () => {
    expect(freeSession('w1', '2026-11-04', '2026-11-04T12:00:00.000Z')).toMatchObject({
      id: 'w1', routine_day_id: null, name: 'Sesión libre', exercises: [],
    });
  });

  it('creates the API payloads', () => {
    const session = sessionFromDay(today, () => 'x', '2026-11-02T22:00:00.000Z');
    expect(workoutPayload(session)).toEqual({
      routine_day_id: 10, date: '2026-11-02', started_at: '2026-11-02T22:00:00.000Z',
      finished_at: null, bodyweight_kg: null, notes: null,
    });
    expect(workoutExercisePayload('w', session.exercises[0])).toEqual({
      workout_id: 'w', exercise_id: 1, position: 0, target_sets: 1, target_reps_min: null, target_reps_max: null,
      target_text: '~30', default_set_type: 'bilbo', rest_seconds: 180, notes: null,
    });
    expect(setPayload('we', {
      id: 's', set_number: 2, set_type: 'normal', weight_kg: 30, reps: 8, side: 'left', rir: 2, pain_level: null, notes: null,
    })).toEqual({
      workout_exercise_id: 'we', set_number: 2, set_type: 'normal', weight_kg: 30, reps: 8, side: 'left', rir: 2, pain_level: null, notes: null,
    });
  });

  it('maps a server workout into a session', () => {
    const detail: WorkoutDetail = {
      id: 'w', routine_day_id: null, routine_day_name: null, date: '2026-10-01', started_at: 'a', finished_at: 'b',
      bodyweight_kg: 79, notes: null,
      exercises: [{
        id: 'we', workout_id: 'w', exercise: bench, position: 0, target_sets: null, target_reps_min: null,
        target_reps_max: null, target_text: null, default_set_type: 'normal', rest_seconds: 120, notes: null,
        sets: [{ id: 's', set_number: 1, set_type: 'normal', weight_kg: 80, reps: 3, side: 'both', rir: null, pain_level: null, notes: null }],
      }],
    };
    const session = sessionFromDetail(detail);
    expect(session.name).toBe('Sesión libre');
    expect(session.exercises[0].exercise).toEqual({
      id: 1, name: 'Press de banca', uses_bodyweight: false, is_unilateral: false, equipment: 'barbell',
    });
    expect(session.exercises[0].sets).toHaveLength(1);
    expect(session.exercises[0].last_performance).toBeNull();
  });
});
