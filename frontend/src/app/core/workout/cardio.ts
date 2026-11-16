import type { ExerciseKind, WorkoutSet } from '../models/exercise';
import type { SessionExercise, WorkoutSetInput } from '../models/workout';
import { formatNumber } from './set-suggestions';

export const DEFAULT_SEGMENT_SECONDS = 1800;

export function isCardio(exercise: { kind?: ExerciseKind }): boolean {
  return exercise.kind === 'cardio';
}

/** Un tramo nuevo: peso y reps en 0; duración, velocidad e inclinación del tramo anterior o de la última vez. */
export function suggestNextSegment(item: SessionExercise): WorkoutSetInput {
  const reference = item.sets.at(-1) ?? item.last_performance?.sets[0];
  return {
    weight_kg: 0,
    reps: 0,
    set_type: 'normal',
    side: 'both',
    rir: null,
    pain_level: null,
    notes: null,
    duration_seconds: reference?.duration_seconds ?? DEFAULT_SEGMENT_SECONDS,
    speed_kmh: reference?.speed_kmh ?? null,
    incline_pct: reference?.incline_pct ?? null,
    distance_km: null,
    avg_heart_rate: null,
    calories: null,
  };
}

export function stepMinutes(seconds: number, deltaMinutes: number): number {
  return Math.max(60, seconds + deltaMinutes * 60);
}

/** Velocidad e inclinación de 0,5 en 0,5; desde vacío parte en 0. */
export function stepHalf(value: number | null, delta: number): number {
  return Math.max(0, Math.round(((value ?? 0) + delta) * 10) / 10);
}

/** 2100 → "35 min"; 2130 → "35:30 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes}:${String(rest).padStart(2, '0')} min`;
}

export function formatSegmentLine(set: WorkoutSet): string {
  const parts = [formatDuration(set.duration_seconds ?? 0)];
  if (set.speed_kmh != null) parts.push(`${formatNumber(set.speed_kmh)} km/h`);
  if (set.incline_pct != null) parts.push(`${formatNumber(set.incline_pct)} %`);
  if (set.distance_km != null) parts.push(`${formatNumber(set.distance_km)} km`);
  if (set.avg_heart_rate != null) parts.push(`FC ${set.avg_heart_rate}`);
  if (set.calories != null) parts.push(`${set.calories} kcal`);
  return parts.join(' · ');
}

export function formatCardioTotal(sets: WorkoutSet[]): string {
  const seconds = sets.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const withDistance = sets.filter((s) => s.distance_km != null);
  const parts = [`Total: ${formatDuration(seconds)}`];
  if (withDistance.length) {
    const km = Math.round(withDistance.reduce((sum, s) => sum + s.distance_km!, 0) * 100) / 100;
    parts.push(`${formatNumber(km)} km`);
  }
  return parts.join(' · ');
}

export function formatSegments(n: number): string {
  return `${n} ${n === 1 ? 'tramo' : 'tramos'}`;
}
