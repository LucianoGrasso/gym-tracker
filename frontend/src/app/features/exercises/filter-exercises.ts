import type { Equipment, Exercise, MuscleGroup } from '../../core/models/exercise';
import { MUSCLE_GROUP_LABELS, MUSCLE_REGION_LABELS } from '../../core/models/labels';
import type { LibraryExercise } from '../../core/models/library';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Filtro en el cliente: instantáneo mientras se escribe e independiente de tildes. */
export function filterExercises(list: Exercise[], search: string, group: MuscleGroup | null): Exercise[] {
  const term = normalize(search.trim());
  return list.filter(
    (exercise) => (!group || exercise.muscle_group === group) && (!term || normalize(exercise.name).includes(term)),
  );
}

/** Biblioteca: busca en el nombre, el músculo principal y su zona ("pierna", "espalda"); los chips se combinan. */
export function filterLibrary(
  list: LibraryExercise[],
  search: string,
  group: MuscleGroup | null,
  equipment: Equipment | null,
): LibraryExercise[] {
  const term = normalize(search.trim());
  return list.filter((exercise) => {
    if (group && exercise.muscle_group !== group) return false;
    if (equipment && exercise.equipment !== equipment) return false;
    if (!term) return true;
    const muscle = MUSCLE_GROUP_LABELS[exercise.muscle_group];
    const region = MUSCLE_REGION_LABELS[exercise.muscle_group] ?? '';
    return normalize(`${exercise.name} ${muscle} ${region}`).includes(term);
  });
}
