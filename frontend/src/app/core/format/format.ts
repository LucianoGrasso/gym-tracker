const kgFormatter = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 42.5 → "42,5 kg" */
export function formatKg(value: number): string {
  return `${kgFormatter.format(value)} kg`;
}

/**
 * "2026-11-03" → "03/11/2026".
 * Toma la parte de fecha del string tal cual (sin conversión de zona horaria):
 * el backend entrega fechas locales de America/Santiago.
 */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** "2026-11-03" → "03/11" (ejes de gráficos). */
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}`;
}

/** Suma días a una fecha "aaaa-mm-dd" (sin zona horaria). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const santiagoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' });

/** Fecha de hoy en Santiago como "aaaa-mm-dd". */
export function localToday(now: Date = new Date()): string {
  return santiagoDate.format(now);
}
