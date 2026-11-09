import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { take } from 'rxjs';
import { PushApi } from '../api/push-api';
import type { PushStatus, PushSubscriptionJson } from '../models/push';

export const REST_PUSH_TITLE = '¡Descanso terminado!';

const STORAGE_KEY = 'gymtracker.push';
const MAX_SECONDS = 3600;

interface Stored {
  status: 'on' | 'declined';
  subscription?: PushSubscriptionJson;
  signature?: string;
}

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function notificationPermission(): NotificationPermission | null {
  return typeof Notification === 'undefined' ? null : Notification.permission;
}

/** Avisos push de fin de descanso, activados por dispositivo. */
@Injectable({ providedIn: 'root' })
export class PushService {
  // Opcional: en desarrollo (y en tests) no hay service worker.
  private readonly sw = inject(SwPush, { optional: true });
  private readonly injector = inject(Injector);
  private readonly stored = signal<Stored | null>(readStored());
  private readonly denied = signal(notificationPermission() === 'denied');

  private readonly supported = !!this.sw?.isEnabled && typeof window !== 'undefined' && 'PushManager' in window;

  readonly status = computed<PushStatus>(() => {
    if (!this.supported) return 'unsupported';
    if (this.denied()) return 'blocked';
    return this.stored()?.status ?? 'unasked';
  });

  constructor() {
    // iOS puede borrar la suscripción (p. ej. al reinstalar la app): entonces volvemos a preguntar.
    if (this.supported && this.stored()?.status === 'on') {
      this.sw!.subscription.pipe(take(1)).subscribe((sub) => {
        if (sub === null) this.save(null);
      });
    }
  }

  /** Pide permiso y suscribe este dispositivo. Debe llamarse desde un toque del usuario (iOS lo exige). */
  async enable(): Promise<boolean> {
    if (!this.supported) return false;
    try {
      const serverPublicKey = await this.api.publicKey();
      if (!serverPublicKey) return false;
      const sub = await this.sw!.requestSubscription({ serverPublicKey });
      const subscription = sub.toJSON() as PushSubscriptionJson;
      const signature = await this.api.token(subscription.endpoint);
      this.save({ status: 'on', subscription, signature });
      return true;
    } catch {
      this.denied.set(notificationPermission() === 'denied');
      return false;
    }
  }

  async disable(): Promise<void> {
    this.save({ status: 'declined' });
    try {
      await this.sw?.unsubscribe();
    } catch {
      // Ya no había suscripción: nada que hacer.
    }
  }

  decline(): void {
    this.save({ status: 'declined' });
  }

  async schedule(seconds: number, body: string, url: string): Promise<void> {
    const active = this.active();
    if (!active) return;
    try {
      await this.api.schedule({
        subscription: active.subscription,
        signature: active.signature,
        seconds: Math.min(MAX_SECONDS, Math.max(1, Math.round(seconds))),
        title: REST_PUSH_TITLE,
        body,
        url,
      });
    } catch {
      // Sin señal: la barra y la vibración siguen avisando con la app abierta.
    }
  }

  async cancel(): Promise<void> {
    const active = this.active();
    if (!active) return;
    try {
      await this.api.cancel({ endpoint: active.subscription.endpoint, signature: active.signature });
    } catch {
      // Peor caso: llega un aviso de más.
    }
  }

  /** Se pide recién al usarla: sin soporte (o en tests de otros servicios) no hace falta HttpClient. */
  private get api(): PushApi {
    return this.injector.get(PushApi);
  }

  private active(): Required<Stored> | null {
    const s = this.stored();
    return s?.status === 'on' && s.subscription && s.signature ? (s as Required<Stored>) : null;
  }

  private save(value: Stored | null): void {
    this.stored.set(value);
    try {
      if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Sin almacenamiento: queda solo en memoria.
    }
  }
}
