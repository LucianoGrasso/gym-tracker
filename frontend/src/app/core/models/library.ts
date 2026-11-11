import type { Equipment, MuscleGroup } from './exercise';

/** Ejercicio de la biblioteca; `owned_exercise_id` es el ejercicio propio con ese nombre, si ya existe. */
export interface LibraryExercise {
  slug: string;
  name: string;
  muscle_group: MuscleGroup;
  secondary_muscles: MuscleGroup[];
  equipment: Equipment;
  is_unilateral: boolean;
  uses_bodyweight: boolean;
  owned_exercise_id: number | null;
}
