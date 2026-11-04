import type { Exercise, ExerciseSession, WorkoutSet } from '../models/exercise';
import type { Today } from '../models/routine';
import type { ExerciseRef, Session, SessionExercise, WorkoutDetail } from '../models/workout';

const ref = (exercise: Exercise | ExerciseRef): ExerciseRef => ({
  id: exercise.id,
  name: exercise.name,
  uses_bodyweight: exercise.uses_bodyweight,
  is_unilateral: exercise.is_unilateral,
});

/** Copia la plantilla del día (ejercicios + objetivos) a una sesión nueva. */
export function sessionFromDay(today: Today, makeId: () => string, now: string): Session {
  const day = today.day!;
  const id = makeId();
  return {
    id,
    routine_day_id: day.id,
    name: day.name,
    date: today.date,
    started_at: now,
    finished_at: null,
    bodyweight_kg: null,
    notes: null,
    exercises: day.exercises.map((item, position) => ({
      id: makeId(),
      exercise: ref(item.exercise),
      position,
      target_sets: item.target_sets,
      target_reps_min: item.target_reps_min,
      target_reps_max: item.target_reps_max,
      target_text: item.target_text,
      default_set_type: item.default_set_type,
      rest_seconds: item.rest_seconds,
      notes: item.notes,
      last_performance: item.last_performance,
      sets: [],
    })),
  };
}

export function freeSession(id: string, date: string, now: string): Session {
  return { id, routine_day_id: null, name: 'Sesión libre', date, started_at: now, finished_at: null, bodyweight_kg: null, notes: null, exercises: [] };
}

/** Ejercicio agregado solo para esta sesión (sin objetivos de rutina). */
export function sessionExerciseFrom(
  exercise: Exercise,
  id: string,
  position: number,
  lastPerformance: ExerciseSession | null,
): SessionExercise {
  return {
    id,
    exercise: ref(exercise),
    position,
    target_sets: null,
    target_reps_min: null,
    target_reps_max: null,
    target_text: null,
    default_set_type: 'normal',
    rest_seconds: 150,
    notes: null,
    last_performance: lastPerformance,
    sets: [],
  };
}

export function sessionFromDetail(detail: WorkoutDetail): Session {
  return {
    id: detail.id,
    routine_day_id: detail.routine_day_id,
    name: detail.routine_day_name ?? 'Sesión libre',
    date: detail.date,
    started_at: detail.started_at,
    finished_at: detail.finished_at,
    bodyweight_kg: detail.bodyweight_kg,
    notes: detail.notes,
    exercises: detail.exercises.map(({ workout_id: _w, exercise, ...item }) => ({
      ...item,
      exercise: ref(exercise),
      last_performance: null,
    })),
  };
}

export function workoutPayload(session: Session) {
  const { routine_day_id, date, started_at, finished_at, bodyweight_kg, notes } = session;
  return { routine_day_id, date, started_at, finished_at, bodyweight_kg, notes };
}

export function workoutExercisePayload(workoutId: string, item: SessionExercise) {
  return {
    workout_id: workoutId,
    exercise_id: item.exercise.id,
    position: item.position,
    target_sets: item.target_sets,
    target_reps_min: item.target_reps_min,
    target_reps_max: item.target_reps_max,
    target_text: item.target_text,
    default_set_type: item.default_set_type,
    rest_seconds: item.rest_seconds,
    notes: item.notes,
  };
}

export function setPayload(workoutExerciseId: string, set: WorkoutSet) {
  const { id: _id, ...rest } = set;
  return { workout_exercise_id: workoutExerciseId, ...rest };
}
