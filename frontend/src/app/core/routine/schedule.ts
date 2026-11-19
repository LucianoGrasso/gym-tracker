import type { RoutineDay } from '../models/routine';

export type ScheduleDay = Pick<RoutineDay, 'id' | 'weekday' | 'position'>;

export interface DayAssignment {
  id: number;
  weekday: number | null;
}

/** Orden del tablero: lunes→domingo y después los sin día fijo por posición. */
export function boardOrder<T extends ScheduleDay>(days: readonly T[]): T[] {
  const fixed = days.filter((d) => d.weekday !== null).sort((a, b) => a.weekday! - b.weekday!);
  const tray = days.filter((d) => d.weekday === null).sort((a, b) => a.position - b.position);
  return [...fixed, ...tray];
}

/**
 * Suelta un día en `target` (1–7, o null = sin día fijo, en `trayIndex`).
 * Si el destino está ocupado, el que estaba toma el lugar de origen del arrastrado.
 * Devuelve todos los días en orden de tablero, con `position` = su índice.
 */
export function moveDay<T extends ScheduleDay>(
  days: readonly T[],
  dayId: number,
  target: number | null,
  trayIndex = Number.MAX_SAFE_INTEGER,
): T[] {
  const moving = days.find((d) => d.id === dayId);
  if (!moving) return boardOrder(days);
  const from = moving.weekday;
  const displaced =
    target === null ? undefined : days.find((d) => d.weekday === target && d.id !== dayId);

  const oldTray = boardOrder(days)
    .filter((d) => d.weekday === null)
    .map((d) => d.id);
  const tray = oldTray.filter((id) => id !== dayId);
  if (target === null) {
    tray.splice(Math.min(trayIndex, tray.length), 0, dayId);
  } else if (displaced && from === null) {
    tray.splice(oldTray.indexOf(dayId), 0, displaced.id);
  }

  const weekdayOf = (d: T): number | null => {
    if (d.id === dayId) return target;
    if (displaced && d.id === displaced.id) return from;
    return d.weekday;
  };

  const fixed = days
    .map((d) => ({ ...d, weekday: weekdayOf(d) }))
    .filter((d) => d.weekday !== null)
    .sort((a, b) => a.weekday! - b.weekday!);
  const trayDays = tray.map((id) => ({ ...days.find((d) => d.id === id)!, weekday: null }));

  return [...fixed, ...trayDays].map((d, position) => ({ ...d, position }));
}

export function toAssignments(days: readonly ScheduleDay[]): DayAssignment[] {
  return days.map(({ id, weekday }) => ({ id, weekday }));
}
