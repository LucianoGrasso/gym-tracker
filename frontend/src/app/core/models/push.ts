export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface RestPushRequest {
  subscription: PushSubscriptionJson;
  signature: string;
  /** Fin del descanso, epoch en ms. */
  endsAt: number;
  title: string;
  body: string;
  url: string;
  /** Ejecución anterior de este dispositivo: se detiene antes de iniciar la nueva. */
  replace?: string;
}

export interface CancelPushRequest {
  endpoint: string;
  signature: string;
  execution: string;
}

export type PushStatus = 'unsupported' | 'unasked' | 'on' | 'declined' | 'blocked';
