export type MuscleGroup =
  | 'chest'
  | 'lats'
  | 'upper_back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'other';
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'bodyweight'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'band'
  | 'smith';
export type ExerciseKind = 'strength' | 'cardio';
export type SetType = 'warmup' | 'normal' | 'bilbo' | 'heavy' | 'failure' | 'dropset';
export type Side = 'both' | 'left' | 'right';

export interface Exercise {
  id: number;
  name: string;
  /** Ausente en ejercicios guardados en el dispositivo antes del 2026-11-16: es fuerza. */
  kind?: ExerciseKind;
  muscle_group: MuscleGroup;
  /** Cuentan ½ serie en las estadísticas. */
  secondary_muscles: MuscleGroup[];
  equipment: Equipment;
  is_unilateral: boolean;
  uses_bodyweight: boolean;
  notes: string | null;
  archived_at: string | null;
  has_history?: boolean;
}

export type ExerciseInput = Pick<
  Exercise,
  'name' | 'muscle_group' | 'secondary_muscles' | 'equipment' | 'is_unilateral' | 'uses_bodyweight' | 'notes'
> & { kind: ExerciseKind };

export interface WorkoutSet {
  id: string;
  set_number: number;
  set_type: SetType;
  weight_kg: number;
  reps: number;
  side: Side;
  rir: number | null;
  pain_level: number | null;
  notes: string | null;
  /** Tramos de cardio (ausentes en series guardadas antes del 2026-11-16). */
  duration_seconds?: number | null;
  speed_kmh?: number | null;
  incline_pct?: number | null;
  distance_km?: number | null;
  avg_heart_rate?: number | null;
  calories?: number | null;
}

export interface ExerciseSession {
  workout_id: string;
  date: string;
  sets: WorkoutSet[];
}

export interface Paginated<T> {
  data: T[];
  meta: { current_page: number; last_page: number };
}
