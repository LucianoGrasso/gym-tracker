import type { Equipment, MuscleGroup, SetType } from './exercise';
import type { TemplateGoal, TemplateLevel } from './routine-template';
import type { StatsPeriod } from './stats';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  lats: 'Dorsales',
  upper_back: 'Espalda alta',
  shoulders: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  quads: 'Cuádriceps',
  hamstrings: 'Femorales',
  glutes: 'Glúteos',
  calves: 'Gemelos',
  core: 'Core',
  other: 'Otro',
};

/** Zona del cuerpo de cada músculo: sirve para buscar "pierna" o "espalda". */
export const MUSCLE_REGION_LABELS: Partial<Record<MuscleGroup, string>> = {
  lats: 'Espalda',
  upper_back: 'Espalda',
  quads: 'Piernas',
  hamstrings: 'Piernas',
  glutes: 'Piernas',
  calves: 'Piernas',
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

export const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '1w': '1 sem',
  '1m': '1 mes',
  '3m': '3 meses',
  '6m': '6 meses',
  '1y': '1 año',
  all: 'Todo',
};

export const STATS_PERIODS = Object.keys(PERIOD_LABELS) as StatsPeriod[];

export const TEMPLATE_LEVEL_LABELS: Record<TemplateLevel, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

export const TEMPLATE_GOAL_LABELS: Record<TemplateGoal, string> = {
  strength: 'Fuerza',
  hypertrophy: 'Hipertrofia',
  mixed: 'Fuerza e hipertrofia',
};
