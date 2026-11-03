import type { Equipment, MuscleGroup, SetType } from './exercise';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  legs: 'Piernas',
  core: 'Core',
  other: 'Otro',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuerna',
  bodyweight: 'Peso corporal',
  machine: 'Máquina',
  cable: 'Polea',
};

export const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: 'Calentamiento',
  normal: 'Normal',
  bilbo: 'Bilbo',
  heavy: 'Pesada',
  failure: 'Al fallo',
  dropset: 'Dropset',
};

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export const MUSCLE_GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];
export const EQUIPMENTS = Object.keys(EQUIPMENT_LABELS) as Equipment[];
export const SET_TYPES = Object.keys(SET_TYPE_LABELS) as SetType[];
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
