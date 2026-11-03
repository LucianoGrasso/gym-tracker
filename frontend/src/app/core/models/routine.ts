import type { Exercise, ExerciseSession, SetType } from './exercise';

export interface RoutineDayExercise {
  id: number;
  routine_day_id: number;
  exercise: Exercise;
  position: number;
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_text: string | null;
  default_set_type: SetType;
  rest_seconds: number;
  notes: string | null;
}

export type RoutineDayExerciseTargets = Omit<RoutineDayExercise, 'id' | 'routine_day_id' | 'exercise' | 'position'>;
export type RoutineDayExerciseInput = RoutineDayExerciseTargets & { exercise_id: number };

export interface RoutineDay {
  id: number;
  routine_id: number;
  name: string;
  weekday: number | null;
  position: number;
  exercises?: RoutineDayExercise[];
}

export interface Routine {
  id: number;
  name: string;
  notes: string | null;
  is_active: boolean;
  days_count?: number;
  days?: RoutineDay[];
}

export interface TodayExercise extends RoutineDayExercise {
  last_performance: ExerciseSession | null;
}

export interface Today {
  date: string;
  weekday: number;
  routine: Pick<Routine, 'id' | 'name'> | null;
  day: (Omit<RoutineDay, 'exercises'> & { exercises: TodayExercise[] }) | null;
  days: Pick<RoutineDay, 'id' | 'name' | 'weekday'>[];
}
