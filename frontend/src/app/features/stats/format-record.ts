import { formatKg } from '../../core/format/format';
import type { BestE1rmRecord, HeaviestRecord, MostRepsRecord, RecentRecord } from '../../core/models/stats';

export function formatHeaviest(record: HeaviestRecord): string {
  return `${formatKg(record.load_kg)} × ${record.reps}`;
}

export function formatBestE1rm(record: BestE1rmRecord): string {
  return `${formatKg(record.e1rm_kg)} (${formatKg(record.load_kg)} × ${record.reps})`;
}

export function formatMostReps(record: MostRepsRecord): string {
  return record.load_kg === null ? `${record.reps} reps` : `${record.reps} reps con ${formatKg(record.load_kg)}`;
}

export function formatRecentRecord(record: RecentRecord): string {
  return record.type === 'heaviest'
    ? `Récord de peso: ${formatHeaviest(record)}`
    : `Mejor 1RM estimado: ${formatBestE1rm(record)}`;
}
