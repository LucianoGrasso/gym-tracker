import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceKey, executionPrefix, notificationPayload, ownsExecution, sign, verify } from '../lambda/push/core';
import { createHandler, type Deps, type HttpEvent } from '../lambda/push/handler';

const KEY = 'test-signing-key';
const ENDPOINT = 'https://push.example.com/send/abc';
const SIGNATURE = 'dfad34ed1137f5f974053060f49ea947a78018b6f8dbb6ec21c1899314ba4555';
const STATE_MACHINE = 'arn:aws:states:us-east-2:1:stateMachine:gymtracker-rest';
const PREFIX = 'arn:aws:states:us-east-2:1:execution:gymtracker-rest:';
const NOW = new Date('2026-11-09T22:00:00.000Z');
const OWN_EXECUTION = `${PREFIX}${deviceKey(ENDPOINT)}-1762725500000`;
const subscription = { endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' } };
const rest = {
  subscription,
  signature: SIGNATURE,
  seconds: 90,
  title: '¡Descanso terminado!',
  body: 'Press de banca · serie 3 de 4',
  url: '/entrenamiento/01JABC',
};

const post = (rawPath: string, body: unknown): HttpEvent => ({
  rawPath,
  requestContext: { http: { method: 'POST' } },
  body: typeof body === 'string' ? body : JSON.stringify(body),
  isBase64Encoded: false,
});

describe('push core', () => {
  it('signs exactly like Laravel and verifies in constant time', () => {
    expect(sign(ENDPOINT, KEY)).toBe(SIGNATURE);
    expect(verify(ENDPOINT, SIGNATURE, KEY)).toBe(true);
    expect(verify(ENDPOINT, SIGNATURE.replace('d', 'e'), KEY)).toBe(false);
    expect(verify(ENDPOINT, 'abc', KEY)).toBe(false);
    expect(verify('https://other.example.com', SIGNATURE, KEY)).toBe(false);
  });

  it('derives one stable key per device', () => {
    expect(deviceKey(ENDPOINT)).toMatch(/^rest-[0-9a-f]{32}$/);
    expect(deviceKey(ENDPOINT)).toBe(deviceKey(ENDPOINT));
    expect(deviceKey('https://other.example.com')).not.toBe(deviceKey(ENDPOINT));
  });

  it('only lets a device touch its own executions', () => {
    expect(executionPrefix(STATE_MACHINE)).toBe(PREFIX);
    expect(ownsExecution(OWN_EXECUTION, ENDPOINT, PREFIX)).toBe(true);
    expect(ownsExecution(`${PREFIX}${deviceKey('https://other.example.com')}-1762725500000`, ENDPOINT, PREFIX)).toBe(false);
    expect(ownsExecution(`${PREFIX}${deviceKey(ENDPOINT)}-123`, ENDPOINT, PREFIX)).toBe(false);
    expect(ownsExecution(OWN_EXECUTION.replace('gymtracker-rest', 'otra'), ENDPOINT, PREFIX)).toBe(false);
    expect(ownsExecution(42, ENDPOINT, PREFIX)).toBe(false);
  });

  it('builds the payload Angular service worker understands', () => {
    expect(JSON.parse(notificationPayload({ title: 'T', body: 'B', url: '/entrenamiento/1' }))).toEqual({
      notification: {
        title: 'T',
        body: 'B',
        icon: '/icons/icon-192.png',
        tag: 'rest',
        renotify: true,
        data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/entrenamiento/1' } } },
      },
    });
  });
});

describe('push handler', () => {
  const start = vi.fn();
  const stop = vi.fn();
  const sendPush = vi.fn();
  const deps: Deps = {
    timer: { start, stop },
    sendPush,
    now: () => NOW,
    config: { signingKey: KEY, stateMachineArn: STATE_MACHINE },
  };
  const handler = createHandler(deps);
  const NEW_EXECUTION = `${PREFIX}${deviceKey(ENDPOINT)}-${NOW.getTime()}`;

  beforeEach(() => {
    start.mockReset().mockResolvedValue(NEW_EXECUTION);
    stop.mockReset().mockResolvedValue(undefined);
    sendPush.mockReset().mockResolvedValue('sent');
  });

  it('starts a timer execution with everything needed to send the push, and returns its id', async () => {
    expect(await handler(post('/push/rest', rest))).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ execution: NEW_EXECUTION }),
    });

    expect(start).toHaveBeenCalledWith(`${deviceKey(ENDPOINT)}-${NOW.getTime()}`, expect.any(String));
    expect(JSON.parse(start.mock.calls[0][1])).toEqual({
      seconds: 90,
      subscription,
      title: rest.title,
      body: rest.body,
      url: rest.url,
    });
    expect(stop).not.toHaveBeenCalled();
  });

  it('stops the previous execution of the device before starting the new one', async () => {
    await handler(post('/push/rest', { ...rest, replace: OWN_EXECUTION }));

    expect(stop).toHaveBeenCalledWith(OWN_EXECUTION);
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]);
  });

  it('still starts the new timer when stopping the old one fails (it already finished)', async () => {
    stop.mockRejectedValue(new Error('ExecutionDoesNotExist'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect((await handler(post('/push/rest', { ...rest, replace: OWN_EXECUTION })))?.statusCode).toBe(200);
    expect(start).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('refuses to replace an execution of another device', async () => {
    const foreign = `${PREFIX}${deviceKey('https://other.example.com')}-1762725500000`;
    expect(await handler(post('/push/rest', { ...rest, replace: foreign }))).toEqual({ statusCode: 422 });
    expect(stop).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('rejects a forged signature', async () => {
    expect(await handler(post('/push/rest', { ...rest, signature: '0'.repeat(64) }))).toEqual({ statusCode: 403 });
    expect(start).not.toHaveBeenCalled();
  });

  it.each([
    ['broken json', '{'],
    ['zero seconds', { ...rest, seconds: 0 }],
    ['too many seconds', { ...rest, seconds: 3601 }],
    ['fractional seconds', { ...rest, seconds: 1.5 }],
    ['http endpoint', { ...rest, subscription: { ...subscription, endpoint: 'http://push.example.com' } }],
    ['missing keys', { ...rest, subscription: { endpoint: ENDPOINT } }],
    ['empty body', { ...rest, body: '' }],
    ['long title', { ...rest, title: 'x'.repeat(121) }],
    ['absolute url', { ...rest, url: 'https://evil.example.com' }],
    ['protocol-relative url', { ...rest, url: '//evil.example.com' }],
  ])('rejects invalid input: %s', async (_name, body) => {
    expect(await handler(post('/push/rest', body))).toEqual({ statusCode: 422 });
    expect(start).not.toHaveBeenCalled();
  });

  it('cancels the device execution', async () => {
    const cancel = { endpoint: ENDPOINT, signature: SIGNATURE, execution: OWN_EXECUTION };
    expect(await handler(post('/push/cancel', cancel))).toEqual({ statusCode: 204 });
    expect(stop).toHaveBeenCalledWith(OWN_EXECUTION);
  });

  it('validates cancel requests too', async () => {
    const cancel = { endpoint: ENDPOINT, signature: SIGNATURE, execution: OWN_EXECUTION };
    expect(await handler(post('/push/cancel', { ...cancel, signature: '0'.repeat(64) }))).toEqual({ statusCode: 403 });
    expect(await handler(post('/push/cancel', { endpoint: ENDPOINT, signature: SIGNATURE }))).toEqual({ statusCode: 422 });
    expect(
      await handler(post('/push/cancel', { ...cancel, execution: `${PREFIX}${deviceKey('https://x.example.com')}-1762725500000` })),
    ).toEqual({ statusCode: 422 });
    expect(stop).not.toHaveBeenCalled();
  });

  it('answers 204 even if the execution already finished', async () => {
    stop.mockRejectedValue(new Error('ExecutionDoesNotExist'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cancel = { endpoint: ENDPOINT, signature: SIGNATURE, execution: OWN_EXECUTION };
    expect(await handler(post('/push/cancel', cancel))).toEqual({ statusCode: 204 });
    warn.mockRestore();
  });

  it('reads base64 bodies', async () => {
    const event = {
      ...post('/push/rest', ''),
      body: Buffer.from(JSON.stringify(rest)).toString('base64'),
      isBase64Encoded: true,
    };
    expect((await handler(event))?.statusCode).toBe(200);
  });

  it('answers 404 and 405 for anything else', async () => {
    expect(await handler(post('/push/other', rest))).toEqual({ statusCode: 404 });
    expect(await handler({ ...post('/push/rest', rest), requestContext: { http: { method: 'GET' } } })).toEqual({
      statusCode: 405,
    });
  });

  it('sends the push when the timer fires', async () => {
    await handler({ kind: 'send', subscription, title: rest.title, body: rest.body, url: rest.url });

    expect(sendPush).toHaveBeenCalledWith(subscription, notificationPayload(rest));
  });

  it('does not fail when the subscription expired', async () => {
    sendPush.mockResolvedValue('gone');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(handler({ kind: 'send', subscription, title: 'T', body: 'B', url: '/' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
