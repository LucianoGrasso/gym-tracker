const hourFormatter = new Intl.DateTimeFormat('es-CL', {
  hour: 'numeric',
  hourCycle: 'h23',
  timeZone: 'America/Santiago',
});

/** Saludo según la hora en Santiago: 05-11 días, 12-19 tardes, resto noches. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(hourFormatter.format(now));
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** "Luciano Grasso Sadi" → "LG" (avatar de la cuenta). */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
  return letters || '?';
}

/** "Luciano Grasso" → "Luciano". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}
