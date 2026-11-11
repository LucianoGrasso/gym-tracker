import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PushApi } from '../api/push-api';
import { PushService, REST_PUSH_TITLE } from './push.service';

const SUB = { endpoint: 'https://push.example.com/send/abc', keys: { p256dh: 'p', auth: 'a' } };
const STORAGE_KEY = 'gymtracker.push';

function setup(opts: { stored?: unknown; supported?: boolean; liveSubscription?: boolean } = {}) {
  const { stored, supported = true, liveSubscription = true } = opts;
  localStorage.clear();
  if (stored) localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  if (supported) Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });

  const sw = {
    isEnabled: supported,
    subscription: of(liveSubscription ? {} : null),
    requestSubscription: vi.fn().mockResolvedValue({ toJSON: () => SUB }),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
  const api = {
    publicKey: vi.fn().mockResolvedValue('BPublicKey'),
    token: vi.fn().mockResolvedValue('sig'),
    schedule: vi.fn().mockResolvedValue('exec-1'),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SwPush, useValue: sw },
      { provide: PushApi, useValue: api },
    ],
  });
  return { sw, api, push: TestBed.inject(PushService) };
}

const ON = { status: 'on', subscription: SUB, signature: 'sig' };

describe('PushService', () => {
  afterEach(() => {
    delete (window as { PushManager?: unknown }).PushManager;
    vi.unstubAllGlobals();
  });

  it('is unsupported without the service worker or the Push API', () => {
    expect(setup({ supported: false }).push.status()).toBe('unsupported');
  });

  it('starts unasked and turns on after subscribing and getting a signature', async () => {
    const { push, sw, api } = setup();
    expect(push.status()).toBe('unasked');

    expect(await push.enable()).toBe(true);

    expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'BPublicKey' });
    expect(api.token).toHaveBeenCalledWith(SUB.endpoint);
    expect(push.status()).toBe('on');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(ON);
  });

  it('reports blocked when the user denies the permission', async () => {
    const { push, sw } = setup();
    sw.requestSubscription.mockRejectedValue(new Error('denied'));
    vi.stubGlobal('Notification', { permission: 'denied' });

    expect(await push.enable()).toBe(false);
    expect(push.status()).toBe('blocked');
  });

  it('asks for the permission first, while the tap still counts (iOS), before any request', async () => {
    const { push, api } = setup();
    const order: string[] = [];
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() => (order.push('permission'), Promise.resolve('granted'))),
    });
    api.publicKey.mockImplementation(() => (order.push('key'), Promise.resolve('BPublicKey')));

    expect(await push.enable()).toBe(true);
    expect(order).toEqual(['permission', 'key']);
  });

  it('stops without any request when the permission is refused', async () => {
    const { push, api } = setup();
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn().mockResolvedValue('denied') });

    expect(await push.enable()).toBe(false);
    expect(push.status()).toBe('blocked');
    expect(api.publicKey).not.toHaveBeenCalled();
  });

  it('explains when enabling fails, and clears it on the next try', async () => {
    const { push, api } = setup();
    api.token.mockRejectedValueOnce(new Error('offline'));

    await push.enable();
    expect(push.error()).toBe('No se pudieron activar los avisos. Revisa tu conexión e inténtalo de nuevo.');

    await push.enable();
    expect(push.error()).toBeNull();
    expect(push.status()).toBe('on');
  });

  it('stays unasked when enabling fails for another reason', async () => {
    const { push, api } = setup();
    api.token.mockRejectedValue(new Error('offline'));

    expect(await push.enable()).toBe(false);
    expect(push.status()).toBe('unasked');
  });

  it('remembers "Ahora no"', () => {
    const { push } = setup();
    push.decline();
    expect(push.status()).toBe('declined');
    expect(setup({ stored: { status: 'declined' } }).push.status()).toBe('declined');
  });

  it('turns off: unsubscribes and remembers it', async () => {
    const { push, sw } = setup({ stored: ON });
    await push.disable();
    expect(sw.unsubscribe).toHaveBeenCalled();
    expect(push.status()).toBe('declined');
  });

  it('asks again when the browser lost the subscription', () => {
    expect(setup({ stored: ON, liveSubscription: false }).push.status()).toBe('unasked');
  });

  it('schedules and cancels with the stored subscription, signature and execution', async () => {
    const { push, api } = setup({ stored: ON });

    const endsAt = Date.now() + 90_000.4;
    await push.schedule(endsAt, 'Press de banca · serie 2 de 4', '/entrenamiento/w1');
    expect(api.schedule).toHaveBeenCalledWith({
      subscription: SUB,
      signature: 'sig',
      endsAt: Math.round(endsAt),
      title: REST_PUSH_TITLE,
      body: 'Press de banca · serie 2 de 4',
      url: '/entrenamiento/w1',
    });

    await push.cancel();
    expect(api.cancel).toHaveBeenCalledWith({ endpoint: SUB.endpoint, signature: 'sig', execution: 'exec-1' });

    await push.cancel();
    expect(api.cancel).toHaveBeenCalledTimes(1);
  });

  it('replaces the previous rest, even after a reload', async () => {
    const first = setup({ stored: ON });
    await first.push.schedule(90, 'x', '/');

    const reloaded = setup({ stored: ON });
    localStorage.setItem('gymtracker.pushExecution', 'exec-1');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SwPush, useValue: reloaded.sw },
        { provide: PushApi, useValue: reloaded.api },
      ],
    });
    const push = TestBed.inject(PushService);
    reloaded.api.schedule.mockResolvedValue('exec-2');

    await push.schedule(1_000, 'x', '/');
    expect(reloaded.api.schedule).toHaveBeenCalledWith(expect.objectContaining({ endsAt: 1_000, replace: 'exec-1' }));

    await push.cancel();
    expect(reloaded.api.cancel).toHaveBeenCalledWith(expect.objectContaining({ execution: 'exec-2' }));
  });

  it('does not cancel when nothing was scheduled', async () => {
    const { push, api } = setup({ stored: ON });
    await push.cancel();
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('caps the end to the hour the Lambda accepts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T22:00:00Z'));
    const { push, api } = setup({ stored: ON });
    await push.schedule(Date.now() + 5_000_000, 'x', '/');
    expect(api.schedule.mock.calls[0][0].endsAt).toBe(Date.now() + 3_600_000);
    vi.useRealTimers();
  });

  it('does nothing when it is not on, and ignores network errors', async () => {
    const off = setup({ stored: { status: 'declined' } });
    await off.push.schedule(90, 'x', '/');
    await off.push.cancel();
    expect(off.api.schedule).not.toHaveBeenCalled();
    expect(off.api.cancel).not.toHaveBeenCalled();

    const on = setup({ stored: ON });
    await on.push.schedule(90, 'x', '/');
    on.api.schedule.mockRejectedValue(new Error('offline'));
    on.api.cancel.mockRejectedValue(new Error('offline'));
    await expect(on.push.schedule(90, 'x', '/')).resolves.toBeUndefined();
    await expect(on.push.cancel()).resolves.toBeUndefined();
  });
});
