import type { MuscleGroup, SetType } from './exercise';

export type TemplateLevel = 'beginner' | 'intermediate' | 'advanced';
export type TemplateGoal = 'strength' | 'hypertrophy' | 'mixed';

export interface TemplateExercise {
  name: string;
  muscle_group: MuscleGroup;
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  default_set_type: SetType;
  rest_seconds: number;
  target_text: string | null;
}

export interface TemplateDay {
  name: string;
  weekday: number | null;
  exercises: TemplateExercise[];
}

export interface RoutineTemplate {
  slug: string;
  name: string;
  inspired_by: string | null;
  description: string;
  days_per_week: number;
  level: TemplateLevel;
  goal: TemplateGoal;
  days: TemplateDay[];
}
