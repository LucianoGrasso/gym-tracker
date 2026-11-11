import type { MuscleGroup } from './exercise';

export type StatsPeriod = '1w' | '1m' | '3m' | '6m' | '1y' | 'all';

export const DEFAULT_STATS_PERIOD: StatsPeriod = '1m';

export interface HeaviestRecord {
  load_kg: number;
  reps: number;
  date: string;
}

export interface MostRepsRecord {
  reps: number;
  load_kg: number | null;
  date: string;
}

export interface BestE1rmRecord {
  e1rm_kg: number;
  load_kg: number;
  reps: number;
  date: string;
}

export interface PersonalRecords {
  heaviest: HeaviestRecord | null;
  most_reps: MostRepsRecord | null;
  best_e1rm: BestE1rmRecord | null;
}

export interface ExerciseSessionStats {
  workout_id: string;
  date: string;
  e1rm_kg: number | null;
  best_load_kg: number | null;
  best_load_reps: number | null;
  volume_kg: number;
  total_reps: number;
  bilbo: { load_kg: number | null; reps: number }[];
}

export interface ExerciseStats {
  period: StatsPeriod;
  exercise: { id: number; name: string; uses_bodyweight: boolean };
  sessions: ExerciseSessionStats[];
  records: PersonalRecords;
}

export type RecentRecord = { exercise_id: number; exercise_name: string } & (
  | ({ type: 'heaviest' } & HeaviestRecord)
  | ({ type: 'best_e1rm' } & BestE1rmRecord)
);

export interface StatsOverview {
  period: StatsPeriod;
  sessions: number;
  sessions_per_week: number;
  effective_sets: number;
  streak_weeks: number;
  recent_records: RecentRecord[];
  exercises: { id: number; name: string; sessions: number }[];
}

export type MuscleStatus = 'none' | 'low' | 'in_range' | 'high';

export interface MuscleSetsEntry {
  muscle: MuscleGroup;
  sets: number;
  sets_per_week: number;
  status: MuscleStatus;
}

export interface MuscleSets {
  period: StatsPeriod;
  weeks: number;
  muscles: MuscleSetsEntry[];
}

export interface Consistency {
  period: StatsPeriod;
  streak_weeks: number;
  weeks: { week_start: string; sessions: number }[];
  days: { date: string; sessions: number }[];
}

export interface BodyweightPoint {
  date: string;
  bodyweight_kg: number;
  source: 'metric' | 'workout';
}

export interface BodyweightSeries {
  period: StatsPeriod;
  points: BodyweightPoint[];
}
