import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface RestRequest {
  subscription: PushSubscriptionJson;
  signature: string;
  seconds: number;
  title: string;
  body: string;
  url: string;
  /** Ejecución anterior de este dispositivo, a detener antes de iniciar la nueva. */
  replace?: unknown;
}

export interface CancelRequest {
  endpoint: string;
  signature: string;
  execution: unknown;
}

/** Lo que la máquina de estados le pasa a la Lambda cuando termina la espera. */
export interface SendEvent {
  kind: 'send';
  subscription: PushSubscriptionJson;
  title: string;
  body: string;
  url: string;
}

const MAX_SECONDS = 3600;

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= max;

const isHttps = (value: unknown): value is string => isText(value, 1000) && value.startsWith('https://');

/** Solo rutas internas de la app: nada de URLs absolutas ni `//otro-sitio`. */
const isAppPath = (value: unknown): value is string =>
  isText(value, 200) && value.startsWith('/') && !value.startsWith('//');

export function sign(endpoint: string, key: string): string {
  return createHmac('sha256', key).update(endpoint).digest('hex');
}

export function verify(endpoint: string, signature: string, key: string): boolean {
  const expected = Buffer.from(sign(endpoint, key), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Identifica al dispositivo sin exponer su endpoint: prefijo de los nombres de sus ejecuciones. */
export function deviceKey(endpoint: string): string {
  return `rest-${createHash('sha256').update(endpoint).digest('hex').slice(0, 32)}`;
}

export function executionName(endpoint: string, now: Date): string {
  return `${deviceKey(endpoint)}-${now.getTime()}`;
}

/** `arn:…:stateMachine:nombre` → `arn:…:execution:nombre:` */
export function executionPrefix(stateMachineArn: string): string {
  return `${stateMachineArn.replace(':stateMachine:', ':execution:')}:`;
}

/** Un dispositivo solo puede detener sus propias ejecuciones. */
export function ownsExecution(arn: unknown, endpoint: string, prefix: string): arn is string {
  if (typeof arn !== 'string' || arn.length > 300) return false;
  const own = `${prefix}${deviceKey(endpoint)}-`;
  return arn.startsWith(own) && /^\d{13}$/.test(arn.slice(own.length));
}

export function parseRest(input: unknown): RestRequest | null {
  if (typeof input !== 'object' || input === null) return null;
  const b = input as Record<string, unknown>;
  const sub = (b['subscription'] ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  const { signature, seconds, title, body, url } = b;

  if (!isHttps(endpoint) || !isText(p256dh, 200) || !isText(auth, 100) || !isText(signature, 128)) return null;
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SECONDS) return null;
  if (!isText(title, 120) || !isText(body, 120) || !isAppPath(url)) return null;

  return { subscription: { endpoint, keys: { p256dh, auth } }, signature, seconds, title, body, url, replace: b['replace'] };
}

export function parseCancel(input: unknown): CancelRequest | null {
  if (typeof input !== 'object' || input === null) return null;
  const { endpoint, signature, execution } = input as Record<string, unknown>;
  return isHttps(endpoint) && isText(signature, 128) ? { endpoint, signature, execution } : null;
}

/** Formato que entiende el service worker de Angular (ngsw): muestra la notificación y abre `url` al tocarla. */
export function notificationPayload(n: { title: string; body: string; url: string }): string {
  return JSON.stringify({
    notification: {
      title: n.title,
      body: n.body,
      icon: '/icons/icon-192.png',
      tag: 'rest',
      renotify: true,
      data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: n.url } } },
    },
  });
}
