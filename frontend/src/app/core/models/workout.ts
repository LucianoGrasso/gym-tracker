import type { Equipment, Exercise, ExerciseSession, SetType, WorkoutSet } from './exercise';

/** `equipment` puede faltar en sesiones guardadas en el dispositivo antes del 2026-11-13. */
export type ExerciseRef = Pick<Exercise, 'id' | 'name' | 'uses_bodyweight' | 'is_unilateral'> & {
  equipment?: Equipment;
};

export type WorkoutSetInput = Omit<WorkoutSet, 'id' | 'set_number'>;

export interface SessionExercise {
  id: string;
  exercise: ExerciseRef;
  position: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_text: string | null;
  default_set_type: SetType;
  rest_seconds: number;
  notes: string | null;
  /** Lo que se hizo la última vez (solo informativo, no se sincroniza). */
  last_performance: ExerciseSession | null;
  sets: WorkoutSet[];
}

/** Documento local de una sesión (en curso o pasada). */
export interface Session {
  id: string;
  routine_day_id: number | null;
  name: string;
  date: string;
  started_at: string;
  finished_at: string | null;
  bodyweight_kg: number | null;
  notes: string | null;
  exercises: SessionExercise[];
}

export interface WorkoutSummary {
  id: string;
  routine_day_id: number | null;
  routine_day_name: string | null;
  date: string;
  started_at: string;
  finished_at: string | null;
  bodyweight_kg: number | null;
  notes: string | null;
  exercises_count: number;
  sets_count: number;
}

export interface WorkoutExerciseDetail extends Omit<SessionExercise, 'exercise' | 'last_performance'> {
  workout_id: string;
  exercise: Exercise;
}

export interface WorkoutDetail extends Omit<WorkoutSummary, 'exercises_count' | 'sets_count'> {
  exercises: WorkoutExerciseDetail[];
}
