import type { WorkoutSet } from '../models/exercise';
import type { RoutineDayExercise } from '../models/routine';
import { formatKg } from './format';

type Targets = Pick<RoutineDayExercise, 'target_sets' | 'target_reps_min' | 'target_reps_max'>;

/** { 3, 8, 12 } → "3 × 8-12"; sin reps → "3 series". */
export function formatTargets({ target_sets, target_reps_min, target_reps_max }: Targets): string {
  const min = target_reps_min ?? target_reps_max;
  const max = target_reps_max ?? target_reps_min;
  if (min === null || max === null) {
    return `${target_sets} ${target_sets === 1 ? 'serie' : 'series'}`;
  }
  return `${target_sets} × ${min === max ? min : `${min}-${max}`}`;
}

/** Mejor serie (más carga, luego más reps), ignorando calentamiento si hay otras. */
export function formatBestSet(sets: WorkoutSet[], usesBodyweight: boolean): string | null {
  const working = sets.filter((s) => s.set_type !== 'warmup');
  const pool = working.length > 0 ? working : sets;
  if (pool.length === 0) {
    return null;
  }
  const best = pool.reduce((a, b) => (b.weight_kg > a.weight_kg || (b.weight_kg === a.weight_kg && b.reps > a.reps) ? b : a));
  if (usesBodyweight) {
    return best.weight_kg > 0 ? `+${formatKg(best.weight_kg)} × ${best.reps}` : `${best.reps} reps`;
  }
  return `${formatKg(best.weight_kg)} × ${best.reps}`;
}

/** 150 → "2:30 min" */
export function formatRest(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest} min`;
}
