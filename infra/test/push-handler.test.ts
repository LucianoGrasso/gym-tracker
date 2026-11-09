import { beforeEach, describe, expect, it, vi } from 'vitest';
import { atExpression, notificationPayload, scheduleName, sign, verify } from '../lambda/push/core';
import { createHandler, type Deps, type HttpEvent } from '../lambda/push/handler';

const KEY = 'test-signing-key';
const ENDPOINT = 'https://push.example.com/send/abc';
const SIGNATURE = 'dfad34ed1137f5f974053060f49ea947a78018b6f8dbb6ec21c1899314ba4555';
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

  it('derives one stable schedule name per device', () => {
    expect(scheduleName(ENDPOINT)).toMatch(/^rest-[0-9a-f]{32}$/);
    expect(scheduleName(ENDPOINT)).toBe(scheduleName(ENDPOINT));
    expect(scheduleName('https://other.example.com')).not.toBe(scheduleName(ENDPOINT));
  });

  it('builds a one-time UTC expression to the second', () => {
    expect(atExpression(new Date('2026-11-09T22:01:30.400Z'))).toBe('at(2026-11-09T22:01:30)');
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
  const upsert = vi.fn();
  const remove = vi.fn();
  const sendPush = vi.fn();
  const deps: Deps = {
    scheduler: { upsert, remove },
    sendPush,
    now: () => new Date('2026-11-09T22:00:00.000Z'),
    config: {
      signingKey: KEY,
      group: 'gymtracker-rest',
      roleArn: 'arn:aws:iam::1:role/scheduler',
      targetArn: 'arn:aws:lambda:us-east-2:1:function:gymtracker-push',
    },
  };
  const handler = createHandler(deps);

  beforeEach(() => {
    upsert.mockReset().mockResolvedValue(undefined);
    remove.mockReset().mockResolvedValue(undefined);
    sendPush.mockReset().mockResolvedValue('sent');
  });

  it('schedules the push for now + seconds, carrying everything needed to send it', async () => {
    expect(await handler(post('/push/rest', rest))).toEqual({ statusCode: 204 });

    expect(upsert).toHaveBeenCalledWith({
      name: scheduleName(ENDPOINT),
      group: 'gymtracker-rest',
      expression: 'at(2026-11-09T22:01:30)',
      roleArn: deps.config.roleArn,
      targetArn: deps.config.targetArn,
      input: expect.any(String),
    });
    expect(JSON.parse(upsert.mock.calls[0][0].input)).toEqual({
      kind: 'send',
      subscription,
      title: rest.title,
      body: rest.body,
      url: rest.url,
    });
  });

  it('rejects a forged signature', async () => {
    expect(await handler(post('/push/rest', { ...rest, signature: '0'.repeat(64) }))).toEqual({ statusCode: 403 });
    expect(upsert).not.toHaveBeenCalled();
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
    expect(upsert).not.toHaveBeenCalled();
  });

  it('cancels the device schedule', async () => {
    expect(await handler(post('/push/cancel', { endpoint: ENDPOINT, signature: SIGNATURE }))).toEqual({
      statusCode: 204,
    });
    expect(remove).toHaveBeenCalledWith(scheduleName(ENDPOINT), 'gymtracker-rest');
  });

  it('validates cancel requests too', async () => {
    expect(await handler(post('/push/cancel', { endpoint: ENDPOINT, signature: '0'.repeat(64) }))).toEqual({
      statusCode: 403,
    });
    expect(await handler(post('/push/cancel', { endpoint: ENDPOINT }))).toEqual({ statusCode: 422 });
    expect(remove).not.toHaveBeenCalled();
  });

  it('reads base64 bodies', async () => {
    const event = {
      ...post('/push/rest', ''),
      body: Buffer.from(JSON.stringify(rest)).toString('base64'),
      isBase64Encoded: true,
    };
    expect(await handler(event)).toEqual({ statusCode: 204 });
  });

  it('answers 404 and 405 for anything else', async () => {
    expect(await handler(post('/push/other', rest))).toEqual({ statusCode: 404 });
    expect(await handler({ ...post('/push/rest', rest), requestContext: { http: { method: 'GET' } } })).toEqual({
      statusCode: 405,
    });
  });

  it('sends the push when the scheduler fires', async () => {
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
