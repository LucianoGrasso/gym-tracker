import { InjectionToken } from '@angular/core';

export const SHORTCUT_NAME = 'GymTracker Salud';
export const RUN_SHORTCUT_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
/** Enlace iCloud del Atajo compartido; vacío oculta "Instalar Atajo". */
export const HEALTH_SHORTCUT_INSTALL_URL = '';

/** Abre una URL externa (Atajos, iCloud). Se inyecta para poder probarlo. */
export const OPEN_URL = new InjectionToken<(url: string) => void>('OPEN_URL', {
  providedIn: 'root',
  factory: () => (url: string) => window.location.assign(url),
});
