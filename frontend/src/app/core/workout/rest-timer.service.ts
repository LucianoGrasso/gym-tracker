import { Injectable, computed, inject, signal } from '@angular/core';
import { PushService } from '../push/push.service';

const STORAGE_KEY = 'gymtracker.restEndsAt';

export function remainingSeconds(endsAt: number | null, now: number): number {
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Texto del aviso push: qué serie viene. */
export interface RestNotice {
  body: string;
  url: string;
}

export function restNoticeBody(name: string, nextSet: number, targetSets: number | null): string {
  return targetSets !== null && nextSet <= targetSets
    ? `${name} · serie ${nextSet} de ${targetSets}`
    : `${name} · serie ${nextSet}`;
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
  private readonly justFinished = signal(false);
  private finishedHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly push = inject(PushService);
  /** Aviso del descanso en curso (null: sin push programado). */
  private notice: RestNotice | null = null;

  readonly remaining = computed(() => remainingSeconds(this.endsAt(), this.now()));
  readonly running = computed(() => this.remaining() > 0);
  /** Últimos 3 segundos: la barra late. */
  readonly ending = computed(() => this.running() && this.remaining() <= 3);
  /** El descanso terminó solo (no con "Saltar"): la barra avisa unos segundos. */
  readonly finished = this.justFinished.asReadonly();

  constructor() {
    if (this.endsAt() !== null) this.tick();
  }

  start(seconds: number, notice?: RestNotice): void {
    this.dismiss();
    this.notice = notice ?? null;
    this.setEndsAt(Date.now() + seconds * 1000);
    this.scheduleCurrent();
  }

  add(seconds: number): void {
    this.setEndsAt(Math.max(this.endsAt() ?? 0, Date.now()) + seconds * 1000);
    this.scheduleCurrent();
  }

  stop(): void {
    this.dismiss();
    this.setEndsAt(null);
    if (this.notice) void this.push.cancel();
    this.notice = null;
  }

  /** Programa (o reprograma) el push para lo que queda del descanso en curso. */
  scheduleCurrent(): void {
    if (this.notice && this.running()) {
      void this.push.schedule(this.remaining(), this.notice.body, this.notice.url);
    }
  }

  /** Cierra el aviso de "descanso terminado". */
  dismiss(): void {
    if (this.finishedHandle !== null) clearTimeout(this.finishedHandle);
    this.finishedHandle = null;
    this.justFinished.set(false);
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
          this.notice = null;
          navigator.vibrate?.([300, 150, 300]);
          this.setEndsAt(null);
          this.justFinished.set(true);
          this.finishedHandle = setTimeout(() => this.dismiss(), 4000);
        }
      }
    }, 250);
  }
}
