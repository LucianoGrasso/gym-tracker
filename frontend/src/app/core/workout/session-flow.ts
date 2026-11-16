import type { SessionExercise } from '../models/workout';
import { isCardio } from './cardio';
import { isPending, workingSets } from './set-suggestions';

export type FlowState = 'ended' | 'current' | 'waiting' | 'none';

/** Mueve `id` justo antes de `beforeId` y renumera las posiciones 0..n-1. */
export function moveBefore(exercises: SessionExercise[], id: string, beforeId: string): SessionExercise[] {
  const moving = exercises.find((e) => e.id === id);
  if (!moving || id === beforeId || !exercises.some((e) => e.id === beforeId)) return exercises;
  const rest = exercises.filter((e) => e.id !== id);
  const at = rest.findIndex((e) => e.id === beforeId);
  return [...rest.slice(0, at), moving, ...rest.slice(at)].map((e, position) => ({ ...e, position }));
}

/** "Terminado · 2 de 4", "Terminado · 1 serie", "Terminado · 1 tramo". */
export function endedLabel(item: SessionExercise): string {
  if (isCardio(item.exercise)) {
    const n = item.sets.length;
    return `Terminado · ${n} ${n === 1 ? 'tramo' : 'tramos'}`;
  }
  const done = workingSets(item.sets).length;
  if (item.target_sets !== null) return `Terminado · ${done} de ${item.target_sets}`;
  return `Terminado · ${done} ${done === 1 ? 'serie' : 'series'}`;
}

/** Qué ofrece cada ejercicio en la sesión: tarjeta compacta, "Terminar ejercicio", "Hacer ahora" o nada. */
export function flowState(item: SessionExercise, currentId: string | null, active: boolean): FlowState {
  if (!active) return 'none';
  if (item.ended_early) return 'ended';
  if (item.id === currentId) return 'current';
  return isPending(item) ? 'waiting' : 'none';
}
