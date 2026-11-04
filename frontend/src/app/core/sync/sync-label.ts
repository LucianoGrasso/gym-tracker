export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'auth';

export function syncLabel(state: SyncState, pending: number, failed: number): string {
  switch (state) {
    case 'auth':
      return 'Inicia sesión para sincronizar';
    case 'offline':
      return pending === 0
        ? 'Sin conexión'
        : `Sin conexión · ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}`;
    case 'error':
      return failed > 0 && pending === 0
        ? `${failed} ${failed === 1 ? 'cambio no se pudo guardar' : 'cambios no se pudieron guardar'}`
        : 'Error al sincronizar · reintentando';
    case 'syncing':
      return pending > 0 ? `Sincronizando ${pending}…` : 'Sincronizado';
    default:
      return 'Sincronizado';
  }
}
