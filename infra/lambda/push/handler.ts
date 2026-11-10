import {
  executionName,
  executionPrefix,
  notificationPayload,
  ownsExecution,
  parseCancel,
  parseRest,
  deviceKey,
  verify,
  waitTimestamp,
  WARM_LEAD_MS,
  type PushSubscriptionJson,
  type SendEvent,
  type WarmEvent,
} from './core';

export interface Deps {
  /** Máquina de estados de Step Functions: espera, despierta esta Lambda, espera y la invoca para enviar. */
  timer: {
    start(name: string, input: string): Promise<string>;
    stop(executionArn: string): Promise<void>;
  };
  sendPush(subscription: PushSubscriptionJson, payload: string): Promise<'sent' | 'gone'>;
  now(): Date;
  config: { signingKey: string; stateMachineArn: string };
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
  headers?: Record<string, string>;
  body?: string;
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

/** Una sola Lambda: la llama la app (HTTP) para programar/cancelar, y la máquina de estados para enviar. */
export function createHandler(deps: Deps) {
  const { config } = deps;
  const prefix = executionPrefix(config.stateMachineArn);

  /** Si la ejecución ya terminó (el aviso ya salió), detenerla falla: da igual. */
  async function stopQuietly(executionArn: string): Promise<void> {
    try {
      await deps.timer.stop(executionArn);
    } catch (e) {
      console.warn(`No se pudo detener ${executionArn}: ${(e as Error).message}`);
    }
  }

  async function rest(body: unknown): Promise<HttpResult> {
    const request = parseRest(body, deps.now());
    if (!request) return status(422);
    const { endpoint } = request.subscription;
    if (!verify(endpoint, request.signature, config.signingKey)) return status(403);
    if (request.replace !== undefined && !ownsExecution(request.replace, endpoint, prefix)) return status(422);

    if (request.replace !== undefined) await stopQuietly(request.replace);
    const execution = await deps.timer.start(
      executionName(endpoint, deps.now()),
      JSON.stringify({
        warmAt: waitTimestamp(request.endsAt - WARM_LEAD_MS),
        sendAt: waitTimestamp(request.endsAt),
        subscription: request.subscription,
        title: request.title,
        body: request.body,
        url: request.url,
      }),
    );
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ execution }) };
  }

  async function cancel(body: unknown): Promise<HttpResult> {
    const request = parseCancel(body);
    if (!request) return status(422);
    if (!verify(request.endpoint, request.signature, config.signingKey)) return status(403);
    if (!ownsExecution(request.execution, request.endpoint, prefix)) return status(422);

    await stopQuietly(request.execution);
    return status(204);
  }

  async function send(event: SendEvent): Promise<void> {
    const outcome = await deps.sendPush(event.subscription, notificationPayload(event));
    if (outcome === 'gone') console.warn(`Suscripción vencida: ${deviceKey(event.subscription.endpoint)}`);
  }

  return async (event: HttpEvent | SendEvent | WarmEvent): Promise<HttpResult | void> => {
    // Solo despierta el contenedor: el envío llega segundos después y ya no paga el arranque en frío.
    if ('kind' in event && event.kind === 'warm') return;
    if ('kind' in event && event.kind === 'send') return send(event);

    const http = event as HttpEvent;
    if (http.requestContext?.http?.method !== 'POST') return status(405);
    if (http.rawPath === '/push/rest') return rest(readJson(http));
    if (http.rawPath === '/push/cancel') return cancel(readJson(http));
    return status(404);
  };
}
