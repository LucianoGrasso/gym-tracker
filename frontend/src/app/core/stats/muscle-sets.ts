import { MUSCLE_GROUP_LABELS } from '../models/labels';
import type { MuscleSetsEntry, MuscleStatus } from '../models/stats';

/** Referencia habitual de hipertrofia: series efectivas por músculo y semana. */
export const MUSCLE_RANGE = { min: 10, max: 20 } as const;

const EMPTY = [0x2a, 0x2d, 0x25];
const LIME = [0xc8, 0xf1, 0x35];
/** Con al menos una serie el músculo ya se distingue del vacío. */
const MIN_VISIBLE = 0.2;

const STATUS_LABELS: Record<Exclude<MuscleStatus, 'none'>, string> = {
  low: 'bajo el rango',
  in_range: 'en rango',
  high: 'sobre el rango',
};

const setsFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

/** 0 sin series → 1 al llegar al tope del rango (20 series/sem). */
export function muscleIntensity(setsPerWeek: number): number {
  return Math.min(1, Math.max(0, setsPerWeek / MUSCLE_RANGE.max));
}

/** Del gris de la superficie al lima de la app, según la intensidad (0–1). */
export function muscleColor(intensity: number): string {
  if (intensity <= 0) {
    return '#2a2d25';
  }
  const t = MIN_VISIBLE + (1 - MIN_VISIBLE) * Math.min(1, intensity);
  const channel = (i: number) =>
    Math.round(EMPTY[i] + (LIME[i] - EMPTY[i]) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** 11.8 → "11,8" */
export function formatSetsPerWeek(value: number): string {
  return setsFormatter.format(value);
}

/** "Cuádriceps · 11,8 series/sem · en rango (10–20)" */
export function formatMuscleDetail(entry: MuscleSetsEntry): string {
  const label = MUSCLE_GROUP_LABELS[entry.muscle];
  if (entry.status === 'none') {
    return `${label} · sin series en el período`;
  }
  const range = `(${MUSCLE_RANGE.min}–${MUSCLE_RANGE.max})`;
  return `${label} · ${formatSetsPerWeek(entry.sets_per_week)} series/sem · ${STATUS_LABELS[entry.status]} ${range}`;
}

/** De más a menos series/sem; los no entrenados al final y "Otro" solo si tiene series. */
export function rankMuscles(entries: MuscleSetsEntry[]): MuscleSetsEntry[] {
  return entries
    .filter((m) => m.muscle !== 'other' || m.sets > 0)
    .sort((a, b) => b.sets_per_week - a.sets_per_week);
}
