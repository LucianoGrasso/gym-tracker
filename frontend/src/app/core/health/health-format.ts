export interface HealthFields {
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  active_calories: number | null;
}

export function hasHealth(w: HealthFields): boolean {
  return w.avg_heart_rate !== null || w.max_heart_rate !== null || w.active_calories !== null;
}

/** Línea corta del historial: "♥ 128 ppm · 412 kcal". */
export function formatHealth(w: HealthFields): string | null {
  const parts: string[] = [];
  if (w.avg_heart_rate !== null) parts.push(`♥ ${w.avg_heart_rate} ppm`);
  if (w.active_calories !== null) parts.push(`${w.active_calories} kcal`);
  return parts.length ? parts.join(' · ') : null;
}
