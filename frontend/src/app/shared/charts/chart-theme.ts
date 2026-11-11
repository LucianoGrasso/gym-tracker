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

/** Rampa secuencial de un solo tono (lima): sin sesión → 1 sesión → 2 o más. */
export const CONSISTENCY_COLORS = ['#20231c', '#6f8f23', '#c8f135'] as const;
