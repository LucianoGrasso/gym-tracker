import { formatKg } from '../format/format';
import type { SetType, WorkoutSet } from '../models/exercise';
import { SET_TYPE_LABELS } from '../models/labels';
import type { SessionExercise, WorkoutSetInput } from '../models/workout';

export const BILBO_INCREASE_REPS = 35;

export function toSetInput(set: WorkoutSet): WorkoutSetInput {
  const { id: _id, set_number: _n, ...input } = set;
  return input;
}

/** Tras un calentamiento basta un minuto (o menos, si la rutina descansa menos). */
export const WARMUP_REST_SECONDS = 60;

export function isWarmup(set: { set_type: SetType }): boolean {
  return set.set_type === 'warmup';
}

/** Series efectivas: todo lo que no es calentamiento. */
export function workingSets<T extends { set_type: SetType }>(sets: T[]): T[] {
  return sets.filter((s) => !isWarmup(s));
}

/** Etiqueta de cada fila: "C" para calentamientos; las efectivas se numeran 1..n saltándolos. */
export function setNumberLabels(sets: { set_type: SetType }[]): string[] {
  let n = 0;
  return sets.map((s) => (isWarmup(s) ? 'C' : String(++n)));
}

/** Ejercicio pendiente: aún no completa sus series efectivas objetivo (o, sin objetivo, no tiene ninguna). */
export function isPending(item: SessionExercise): boolean {
  const done = workingSets(item.sets).length;
  return item.target_sets === null ? done === 0 : done < item.target_sets;
}

export function restAfter(set: { set_type: SetType }, restSeconds: number): number {
  return isWarmup(set) ? Math.min(restSeconds, WARMUP_REST_SECONDS) : restSeconds;
}

/**
 * Valores iniciales de la próxima serie: la anterior de hoy, o la primera efectiva de la última vez.
 * Tras un calentamiento se vuelve al tipo de la rutina y a la carga efectiva de la última vez.
 */
export function suggestNextSet(item: SessionExercise): WorkoutSetInput {
  const lastHere = item.sets.at(-1);
  const previous = item.last_performance?.sets;
  if (lastHere && !isWarmup(lastHere)) {
    return { ...toSetInput(lastHere), pain_level: null, notes: null };
  }
  if (lastHere) {
    const working = previous?.find((s) => !isWarmup(s));
    return {
      weight_kg: working?.weight_kg ?? lastHere.weight_kg,
      reps: working?.reps ?? lastHere.reps,
      set_type: item.default_set_type,
      side: lastHere.side,
      rir: null,
      pain_level: null,
      notes: null,
    };
  }
  const reference = previous?.find((s) => !isWarmup(s)) ?? previous?.[0];
  return {
    weight_kg: reference?.weight_kg ?? 0,
    reps: reference?.reps ?? item.target_reps_max ?? item.target_reps_min ?? 10,
    set_type: item.default_set_type,
    side: 'both',
    rir: null,
    pain_level: null,
    notes: null,
  };
}

export function stepWeight(value: number, delta: number): number {
  return Math.max(0, Math.round((value + delta) * 100) / 100);
}

export function stepReps(value: number, delta: number): number {
  return Math.max(0, Math.round(value + delta));
}

/** "42,5" o "42.5" → 42.5; texto inválido o negativo → fallback. */
export function parseDecimal(text: string, fallback: number): number {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : fallback;
}

const numberFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2, useGrouping: false });

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function bilboHint(item: SessionExercise): { target: number | null; suggestIncrease: boolean } {
  if (item.default_set_type !== 'bilbo') {
    return { target: null, suggestIncrease: false };
  }
  const bestReps = (sets: WorkoutSet[] | undefined) => {
    const bilbo = (sets ?? []).filter((s) => s.set_type === 'bilbo').map((s) => s.reps);
    return bilbo.length ? Math.max(...bilbo) : null;
  };
  const last = bestReps(item.last_performance?.sets);
  const today = bestReps(item.sets);
  return {
    target: last === null ? null : last + 1,
    suggestIncrease: (today ?? last ?? 0) >= BILBO_INCREASE_REPS,
  };
}

const SIDE_SHORT = { both: '', left: 'izq.', right: 'der.' } as const;

export function formatSetLine(set: WorkoutSet, usesBodyweight: boolean): string {
  const load = usesBodyweight
    ? set.weight_kg > 0 ? `+${formatKg(set.weight_kg)} × ${set.reps}` : `${set.reps} reps`
    : `${formatKg(set.weight_kg)} × ${set.reps}`;
  const parts = [load];
  if (set.set_type !== 'normal') parts.push(SET_TYPE_LABELS[set.set_type]);
  if (set.side !== 'both') parts.push(SIDE_SHORT[set.side]);
  if (set.rir !== null) parts.push(`RIR ${set.rir}`);
  if (set.pain_level) parts.push(`molestia ${set.pain_level}`);
  return parts.join(' · ');
}
