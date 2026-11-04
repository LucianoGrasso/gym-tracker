import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_DB, LocalDb } from '../local-db/local-db';
import type { Today } from '../models/routine';
import { SyncService } from '../sync/sync.service';
import { WorkoutSessionService } from './workout-session.service';

const bench = {
  id: 1, name: 'Press de banca', muscle_group: 'chest' as const, equipment: 'barbell' as const,
  is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
};
const pullUps = { ...bench, id: 2, name: 'Dominadas', uses_bodyweight: true };

const today: Today = {
  date: '2026-11-02', weekday: 1, routine: { id: 1, name: 'Rutina' },
  day: {
    id: 10, routine_id: 1, name: 'Lunes', weekday: 1, position: 0,
    exercises: [{
      id: 100, routine_day_id: 10, exercise: bench, position: 0, target_sets: 3, target_reps_min: 8,
      target_reps_max: 12, target_text: null, default_set_type: 'normal', rest_seconds: 120, notes: null,
      last_performance: null,
    }],
  },
  days: [],
};

const setInput = { weight_kg: 30, reps: 10, set_type: 'normal' as const, side: 'both' as const, rir: null, pain_level: null, notes: null };

describe('WorkoutSessionService', () => {
  let db: LocalDb;
  let enqueue: ReturnType<typeof vi.fn>;

  function create(): WorkoutSessionService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: LOCAL_DB, useValue: db }, { provide: SyncService, useValue: { enqueue } }],
    });
    return TestBed.inject(WorkoutSessionService);
  }

  beforeEach(() => {
    db = new LocalDb(`test-${crypto.randomUUID()}`);
    enqueue = vi.fn().mockResolvedValue(undefined);
  });

  it('starts from the routine day and queues the workout before its exercises', async () => {
    const service = create();
    const session = await service.startFromDay(today);

    expect(service.activeId()).toBe(session.id);
    expect(enqueue.mock.calls.map(([method, url]) => `${method} ${url}`)).toEqual([
      `PUT /api/workouts/${session.id}`,
      `PUT /api/workout-exercises/${session.exercises[0].id}`,
    ]);
    expect(enqueue.mock.calls[0][2]).toMatchObject({ routine_day_id: 10, date: '2026-11-02' });
  });

  it('numbers sets, persists them and restores the active session after a reload', async () => {
    const service = create();
    const session = await service.startFromDay(today);
    const exerciseId = session.exercises[0].id;

    const first = await service.addSet(exerciseId, setInput);
    const second = await service.addSet(exerciseId, { ...setInput, reps: 8 });
    expect([first.set_number, second.set_number]).toEqual([1, 2]);
    expect(enqueue).toHaveBeenLastCalledWith('PUT', `/api/workout-sets/${second.id}`, expect.objectContaining({
      workout_exercise_id: exerciseId, set_number: 2, reps: 8,
    }));

    const reloaded = create();
    const restored = await reloaded.restoreActive();
    expect(restored?.exercises[0].sets.map((s) => s.reps)).toEqual([10, 8]);
  });

  it('updates and deletes sets', async () => {
    const service = create();
    const session = await service.startFromDay(today);
    const exerciseId = session.exercises[0].id;
    const set = await service.addSet(exerciseId, setInput);

    await service.updateSet(exerciseId, set.id, { ...setInput, reps: 12 });
    expect(service.session()!.exercises[0].sets[0]).toMatchObject({ id: set.id, set_number: 1, reps: 12 });

    await service.deleteSet(exerciseId, set.id);
    expect(service.session()!.exercises[0].sets).toEqual([]);
    expect(enqueue).toHaveBeenLastCalledWith('DELETE', `/api/workout-sets/${set.id}`);
  });

  it('adds and removes exercises only for this session', async () => {
    const service = create();
    const session = await service.startFree('2026-11-04');

    const added = await service.addExercise(pullUps);
    expect(added.position).toBe(0);
    expect(enqueue).toHaveBeenLastCalledWith('PUT', `/api/workout-exercises/${added.id}`, expect.objectContaining({
      workout_id: session.id, exercise_id: 2,
    }));

    await service.removeExercise(added.id);
    expect(service.session()!.exercises).toEqual([]);
    expect(enqueue).toHaveBeenLastCalledWith('DELETE', `/api/workout-exercises/${added.id}`);
  });

  it('finishes the session and clears the active one', async () => {
    const service = create();
    const session = await service.startFromDay(today);

    await service.finish(78.5);

    expect(service.activeId()).toBeNull();
    expect(enqueue).toHaveBeenLastCalledWith('PUT', `/api/workouts/${session.id}`, expect.objectContaining({
      bodyweight_kg: 78.5, finished_at: expect.any(String),
    }));
    expect(await create().restoreActive()).toBeNull();
  });

  it('removes a session', async () => {
    const service = create();
    const session = await service.startFromDay(today);

    await service.remove();

    expect(service.activeId()).toBeNull();
    expect(service.session()).toBeNull();
    expect(await db.sessions.get(session.id)).toBeUndefined();
    expect(enqueue).toHaveBeenLastCalledWith('DELETE', `/api/workouts/${session.id}`);
  });
});
