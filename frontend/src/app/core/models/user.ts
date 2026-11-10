export interface User {
  id: number;
  name: string;
  email: string;
  /** Fin de una cuenta de demo (ISO 8601); null en cuentas reales. */
  demo_expires_at: string | null;
}
