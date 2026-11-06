import { Injectable, inject, signal } from '@angular/core';
import { WorkoutsApi } from '../api/workouts-api';
import { newId } from '../local-db/ids';
import { LOCAL_DB } from '../local-db/local-db';
import type { Exercise, ExerciseSession, WorkoutSet } from '../models/exercise';
import type { Today } from '../models/routine';
import type { Session, SessionExercise, WorkoutSetInput } from '../models/workout';
import { SyncService } from '../sync/sync.service';
import {
  freeSession,
  sessionExerciseFrom,
  sessionFromDay,
  sessionFromDetail,
  setPayload,
  workoutExercisePayload,
  workoutPayload,
} from './session-mapping';

const ACTIVE_KEY = 'activeSessionId';

/** Mantiene la sesión abierta en IndexedDB y encola cada cambio para la API. */
@Injectable({ providedIn: 'root' })
export class WorkoutSessionService {
  private readonly db = inject(LOCAL_DB);
  private readonly sync = inject(SyncService);
  private readonly workoutsApi = inject(WorkoutsApi);

  readonly session = signal<Session | null>(null);
  readonly activeId = signal<string | null>(null);

  async restoreActive(): Promise<Session | null> {
    const entry = await this.db.cache.get(ACTIVE_KEY);
    const id = (entry?.value as string | undefined) ?? null;
    const session = id ? ((await this.db.sessions.get(id)) ?? null) : null;
    this.activeId.set(session ? session.id : null);
    if (session) this.session.set(session);
    return session;
  }

  /** Abre una sesión: la copia local si existe; si no, la descarga del servidor. */
  async open(id: string): Promise<Session> {
    const current = this.session();
    if (current?.id === id) return current;
    const local = await this.db.sessions.get(id);
    const session = local ?? sessionFromDetail(await this.workoutsApi.get(id));
    if (!local) await this.db.sessions.put(session);
    this.session.set(session);
    return session;
  }

  async startFromDay(today: Today): Promise<Session> {
    const session = sessionFromDay(today, newId, new Date().toISOString());
    await this.begin(session);
    for (const item of session.exercises) {
      await this.sync.enqueue('PUT', `/api/workout-exercises/${item.id}`, workoutExercisePayload(session.id, item));
    }
    return session;
  }

  async startFree(date: string): Promise<Session> {
    const session = freeSession(newId(), date, new Date().toISOString());
    await this.begin(session);
    return session;
  }

  async addExercise(exercise: Exercise, lastPerformance: ExerciseSession | null = null): Promise<SessionExercise> {
    const session = this.require();
    // Máximo + 1 y no length: si se quitó un ejercicio, length chocaría con una posición ocupada.
    const position = Math.max(-1, ...session.exercises.map((e) => e.position)) + 1;
    const item = sessionExerciseFrom(exercise, newId(), position, lastPerformance);
    await this.save({ ...session, exercises: [...session.exercises, item] });
    await this.sync.enqueue('PUT', `/api/workout-exercises/${item.id}`, workoutExercisePayload(session.id, item));
    return item;
  }

  async removeExercise(workoutExerciseId: string): Promise<void> {
    const session = this.require();
    await this.save({ ...session, exercises: session.exercises.filter((e) => e.id !== workoutExerciseId) });
    await this.sync.enqueue('DELETE', `/api/workout-exercises/${workoutExerciseId}`);
  }

  async addSet(workoutExerciseId: string, input: WorkoutSetInput): Promise<WorkoutSet> {
    const item = this.exercise(workoutExerciseId);
    const set: WorkoutSet = {
      id: newId(),
      set_number: Math.max(0, ...item.sets.map((s) => s.set_number)) + 1,
      ...input,
    };
    await this.replaceExercise({ ...item, sets: [...item.sets, set] });
    await this.sync.enqueue('PUT', `/api/workout-sets/${set.id}`, setPayload(item.id, set));
    return set;
  }

  async updateSet(workoutExerciseId: string, setId: string, input: WorkoutSetInput): Promise<void> {
    const item = this.exercise(workoutExerciseId);
    const sets = item.sets.map((s) => (s.id === setId ? { ...s, ...input } : s));
    await this.replaceExercise({ ...item, sets });
    const updated = sets.find((s) => s.id === setId)!;
    await this.sync.enqueue('PUT', `/api/workout-sets/${setId}`, setPayload(item.id, updated));
  }

  async deleteSet(workoutExerciseId: string, setId: string): Promise<void> {
    const item = this.exercise(workoutExerciseId);
    await this.replaceExercise({ ...item, sets: item.sets.filter((s) => s.id !== setId) });
    await this.sync.enqueue('DELETE', `/api/workout-sets/${setId}`);
  }

  async finish(bodyweightKg: number | null): Promise<void> {
    const session = this.require();
    const finished = { ...session, finished_at: new Date().toISOString(), bodyweight_kg: bodyweightKg };
    await this.save(finished);
    await this.sync.enqueue('PUT', `/api/workouts/${session.id}`, workoutPayload(finished));
    await this.clearActive(session.id);
  }

  async remove(): Promise<void> {
    const session = this.require();
    await this.db.sessions.delete(session.id);
    this.session.set(null);
    await this.sync.enqueue('DELETE', `/api/workouts/${session.id}`);
    await this.clearActive(session.id);
  }

  private async begin(session: Session): Promise<void> {
    await this.save(session);
    await this.db.cache.put({ key: ACTIVE_KEY, value: session.id, updatedAt: Date.now() });
    this.activeId.set(session.id);
    await this.sync.enqueue('PUT', `/api/workouts/${session.id}`, workoutPayload(session));
  }

  private async clearActive(id: string): Promise<void> {
    if (this.activeId() === id) {
      await this.db.cache.delete(ACTIVE_KEY);
      this.activeId.set(null);
    }
  }

  private require(): Session {
    const session = this.session();
    if (!session) throw new Error('No hay una sesión abierta.');
    return session;
  }

  private exercise(id: string): SessionExercise {
    const item = this.require().exercises.find((e) => e.id === id);
    if (!item) throw new Error('El ejercicio no pertenece a la sesión.');
    return item;
  }

  private replaceExercise(item: SessionExercise): Promise<void> {
    const session = this.require();
    return this.save({ ...session, exercises: session.exercises.map((e) => (e.id === item.id ? item : e)) });
  }

  private async save(session: Session): Promise<void> {
    this.session.set(session);
    await this.db.sessions.put(session);
  }
}
