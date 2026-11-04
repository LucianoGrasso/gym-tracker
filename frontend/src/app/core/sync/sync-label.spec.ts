import { describe, expect, it } from 'vitest';
import { syncLabel } from './sync-label';

describe('syncLabel', () => {
  it('describes each state in spanish', () => {
    expect(syncLabel('idle', 0, 0)).toBe('Sincronizado');
    expect(syncLabel('syncing', 3, 0)).toBe('Sincronizando 3…');
    expect(syncLabel('offline', 2, 0)).toBe('Sin conexión · 2 pendientes');
    expect(syncLabel('offline', 1, 0)).toBe('Sin conexión · 1 pendiente');
    expect(syncLabel('offline', 0, 0)).toBe('Sin conexión');
    expect(syncLabel('error', 4, 0)).toBe('Error al sincronizar · reintentando');
    expect(syncLabel('error', 0, 2)).toBe('2 cambios no se pudieron guardar');
    expect(syncLabel('auth', 5, 0)).toBe('Inicia sesión para sincronizar');
  });
});
