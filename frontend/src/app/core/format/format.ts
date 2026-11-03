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
