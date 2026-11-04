import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'gymtracker.restEndsAt';

export function remainingSeconds(endsAt: number | null, now: number): number {
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function readStored(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return value > Date.now() ? value : null;
  } catch {
    return null;
  }
}

/** Basado en la hora de término: sigue correcto aunque se recargue la página o se bloquee el teléfono. */
@Injectable({ providedIn: 'root' })
export class RestTimerService {
  private readonly endsAt = signal<number | null>(readStored());
  private readonly now = signal(Date.now());
  private handle: ReturnType<typeof setInterval> | null = null;

  readonly remaining = computed(() => remainingSeconds(this.endsAt(), this.now()));
  readonly running = computed(() => this.remaining() > 0);

  constructor() {
    if (this.endsAt() !== null) this.tick();
  }

  start(seconds: number): void {
    this.setEndsAt(Date.now() + seconds * 1000);
  }

  add(seconds: number): void {
    this.setEndsAt(Math.max(this.endsAt() ?? 0, Date.now()) + seconds * 1000);
  }

  stop(): void {
    this.setEndsAt(null);
  }

  private setEndsAt(value: number | null): void {
    this.endsAt.set(value);
    this.now.set(Date.now());
    try {
      if (value === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Sin almacenamiento disponible: el temporizador sigue funcionando en memoria.
    }
    if (value !== null) this.tick();
  }

  private tick(): void {
    if (this.handle !== null) return;
    this.handle = setInterval(() => {
      this.now.set(Date.now());
      if (this.remaining() === 0) {
        clearInterval(this.handle!);
        this.handle = null;
        if (this.endsAt() !== null) {
          navigator.vibrate?.([300, 150, 300]);
          this.setEndsAt(null);
        }
      }
    }, 250);
  }
}
