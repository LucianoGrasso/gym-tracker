import { Injectable, signal } from '@angular/core';

const CONFIGURED_KEY = 'gt.health.configured';
const LAST_KEY = 'gt.health.last';

/** Última sesión terminada en este dispositivo (para ofrecer el Atajo en /hoy). */
export interface FinishedRef {
  id: string;
  date: string;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* almacenamiento bloqueado: se pierde la preferencia, nada más */
  }
}

function parseLast(raw: string | null): FinishedRef | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<FinishedRef>;
    return typeof value.id === 'string' && typeof value.date === 'string'
      ? { id: value.id, date: value.date }
      : null;
  } catch {
    return null;
  }
}

/** Preferencias del Atajo de Salud en este dispositivo. */
@Injectable({ providedIn: 'root' })
export class HealthStore {
  readonly configured = signal(read(CONFIGURED_KEY) === '1');
  readonly lastFinished = signal<FinishedRef | null>(parseLast(read(LAST_KEY)));

  setConfigured(value: boolean): void {
    write(CONFIGURED_KEY, value ? '1' : null);
    this.configured.set(value);
  }

  rememberFinished(id: string, date: string): void {
    const ref = { id, date };
    write(LAST_KEY, JSON.stringify(ref));
    this.lastFinished.set(ref);
  }

  forgetFinished(): void {
    write(LAST_KEY, null);
    this.lastFinished.set(null);
  }
}
