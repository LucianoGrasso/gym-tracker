import type { MuscleGroup } from '../../core/models/exercise';

/** Tinta y superficie de los gráficos (dirección visual "Pista"). */
export const CHART = {
  surface: '#181a15',
  grid: '#2a2d25',
  axis: '#9ba192',
  ink: '#f2f4ec',
  accent: '#c8f135',
  font: "'Barlow', sans-serif",
  numberFont: "'Barlow Condensed', sans-serif",
} as const;

/**
 * Paleta categórica validada (skill dataviz, script validate_palette) sobre #181a15:
 * banda de luminosidad, croma, separación para daltonismo y contraste en PASS.
 * Orden fijo por grupo (el color sigue al grupo, nunca a su posición); "otro" en gris.
 */
export const MUSCLE_GROUP_COLORS: Record<MuscleGroup, string> = {
  chest: '#3987e5',
  back: '#d95926',
  shoulders: '#199e70',
  biceps: '#c98500',
  triceps: '#d55181',
  legs: '#008300',
  core: '#9085e9',
  other: '#7a7f72',
};

/** Rampa secuencial de un solo tono (lima): sin sesión → 1 sesión → 2 o más. */
export const CONSISTENCY_COLORS = ['#20231c', '#6f8f23', '#c8f135'] as const;
