import type { Exercise, MuscleGroup } from '../../core/models/exercise';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Filtro en el cliente: instantáneo mientras se escribe e independiente de tildes. */
export function filterExercises(list: Exercise[], search: string, group: MuscleGroup | null): Exercise[] {
  const term = normalize(search.trim());
  return list.filter(
    (exercise) => (!group || exercise.muscle_group === group) && (!term || normalize(exercise.name).includes(term)),
  );
}
