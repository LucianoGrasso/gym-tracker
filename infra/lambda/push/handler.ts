import {
  atExpression,
  notificationPayload,
  parseCancel,
  parseRest,
  scheduleName,
  verify,
  type PushSubscriptionJson,
  type SendEvent,
} from './core';

export interface ScheduleInput {
  name: string;
  group: string;
  expression: string;
  roleArn: string;
  targetArn: string;
  input: string;
}

export interface Deps {
  scheduler: {
    upsert(schedule: ScheduleInput): Promise<void>;
    remove(name: string, group: string): Promise<void>;
  };
  sendPush(subscription: PushSubscriptionJson, payload: string): Promise<'sent' | 'gone'>;
  now(): Date;
  config: { signingKey: string; group: string; roleArn: string; targetArn: string };
}

/** Lo que usamos del evento de API Gateway HTTP API (payload 2.0). */
export interface HttpEvent {
  rawPath: string;
  requestContext: { http: { method: string } };
  body?: string;
  isBase64Encoded?: boolean;
}

export interface HttpResult {
  statusCode: number;
}

const status = (statusCode: number): HttpResult => ({ statusCode });

function readJson(event: HttpEvent): unknown {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : (event.body ?? '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Una sola Lambda: la llama la app (HTTP) para programar/cancelar, y Scheduler para enviar. */
export function createHandler(deps: Deps) {
  const { config } = deps;

  async function rest(body: unknown): Promise<HttpResult> {
    const request = parseRest(body);
    if (!request) return status(422);
    if (!verify(request.subscription.endpoint, request.signature, config.signingKey)) return status(403);

    const at = new Date(deps.now().getTime() + request.seconds * 1000);
    const input: SendEvent = {
      kind: 'send',
      subscription: request.subscription,
      title: request.title,
      body: request.body,
      url: request.url,
    };
    await deps.scheduler.upsert({
      name: scheduleName(request.subscription.endpoint),
      group: config.group,
      expression: atExpression(at),
      roleArn: config.roleArn,
      targetArn: config.targetArn,
      input: JSON.stringify(input),
    });
    return status(204);
  }

  async function cancel(body: unknown): Promise<HttpResult> {
    const request = parseCancel(body);
    if (!request) return status(422);
    if (!verify(request.endpoint, request.signature, config.signingKey)) return status(403);

    await deps.scheduler.remove(scheduleName(request.endpoint), config.group);
    return status(204);
  }

  async function send(event: SendEvent): Promise<void> {
    const outcome = await deps.sendPush(event.subscription, notificationPayload(event));
    if (outcome === 'gone') console.warn(`Suscripción vencida: ${scheduleName(event.subscription.endpoint)}`);
  }

  return async (event: HttpEvent | SendEvent): Promise<HttpResult | void> => {
    if ('kind' in event && event.kind === 'send') return send(event);

    const http = event as HttpEvent;
    if (http.requestContext?.http?.method !== 'POST') return status(405);
    if (http.rawPath === '/push/rest') return rest(readJson(http));
    if (http.rawPath === '/push/cancel') return cancel(readJson(http));
    return status(404);
  };
}
