export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'core' | 'other';
export type Equipment = 'barbell' | 'dumbbell' | 'bodyweight' | 'machine' | 'cable';
export type SetType = 'warmup' | 'normal' | 'bilbo' | 'heavy' | 'failure' | 'dropset';
export type Side = 'both' | 'left' | 'right';

export interface Exercise {
  id: number;
  name: string;
  muscle_group: MuscleGroup;
  equipment: Equipment;
  is_unilateral: boolean;
  uses_bodyweight: boolean;
  notes: string | null;
  archived_at: string | null;
  has_history?: boolean;
}

export type ExerciseInput = Pick<
  Exercise,
  'name' | 'muscle_group' | 'equipment' | 'is_unilateral' | 'uses_bodyweight' | 'notes'
>;

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
