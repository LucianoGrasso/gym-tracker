import { formatKg } from '../format/format';
import type { Equipment } from '../models/exercise';
import type { SessionExercise } from '../models/workout';
import { workingSets } from './set-suggestions';

/** Cuánto sube el peso según el equipamiento; `null` = no se sugiere (bandas). */
export const PROGRESSION_STEP_KG: Record<Equipment, number | null> = {
  barbell: 2.5,
  smith: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 5,
  bodyweight: 2.5,
  kettlebell: 4,
  band: null,
};

export interface ProgressionSuggestion {
  /** Peso de la última vez (en peso corporal: lastre). */
  from: number;
  to: number;
  /** Reps propuestas con el peso nuevo: el mínimo del rango. */
  reps: number;
  /** Reps más bajas de la última vez (para "3×12"). */
  lastReps: number;
  lastSets: number;
}

/**
 * Doble progresión: si la última vez todas las series efectivas (al menos las objetivo)
 * usaron el mismo peso y llegaron al tope del rango, sugiere subir un escalón.
 */
export function suggestProgression(item: SessionExercise): ProgressionSuggestion | null {
  const { target_sets: targetSets, target_reps_min: min, target_reps_max: max } = item;
  if (targetSets === null || max === null || item.default_set_type === 'bilbo') return null;
  const equipment = item.exercise.equipment;
  const step = equipment ? PROGRESSION_STEP_KG[equipment] : null;
  if (!step) return null;

  const sets = workingSets(item.last_performance?.sets ?? []);
  if (sets.length === 0 || sets.length < targetSets) return null;
  const from = sets[0].weight_kg;
  if (sets.some((s) => s.weight_kg !== from || s.reps < max)) return null;

  return {
    from,
    to: Math.round((from + step) * 100) / 100,
    reps: min ?? max,
    lastReps: Math.min(...sets.map((s) => s.reps)),
    lastSets: sets.length,
  };
}

export interface ProgressionCopy {
  title: string;
  detail: string;
  keep: string;
}

export function progressionCopy(s: ProgressionSuggestion, usesBodyweight: boolean): ProgressionCopy {
  const done = `${s.lastSets}×${s.lastReps}`;
  if (!usesBodyweight) {
    return {
      title: `¡Sube a ${formatKg(s.to)}!`,
      detail: `La última vez: ${done} con ${formatKg(s.from)}`,
      keep: `Mantener ${formatKg(s.from)}`,
    };
  }
  if (s.from === 0) {
    return {
      title: `¡Agrega ${formatKg(s.to)} de lastre!`,
      detail: `La última vez: ${done} sin lastre`,
      keep: 'Mantener sin lastre',
    };
  }
  return {
    title: `¡Sube el lastre a ${formatKg(s.to)}!`,
    detail: `La última vez: ${done} con +${formatKg(s.from)}`,
    keep: `Mantener +${formatKg(s.from)}`,
  };
}
