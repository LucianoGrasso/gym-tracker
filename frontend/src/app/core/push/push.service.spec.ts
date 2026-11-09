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
    schedule: vi.fn().mockResolvedValue(undefined),
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

  it('schedules and cancels with the stored subscription and signature', async () => {
    const { push, api } = setup({ stored: ON });

    await push.schedule(90.4, 'Press de banca · serie 2 de 4', '/entrenamiento/w1');
    expect(api.schedule).toHaveBeenCalledWith({
      subscription: SUB,
      signature: 'sig',
      seconds: 90,
      title: REST_PUSH_TITLE,
      body: 'Press de banca · serie 2 de 4',
      url: '/entrenamiento/w1',
    });

    await push.cancel();
    expect(api.cancel).toHaveBeenCalledWith({ endpoint: SUB.endpoint, signature: 'sig' });
  });

  it('clamps the seconds to what the Lambda accepts', async () => {
    const { push, api } = setup({ stored: ON });
    await push.schedule(0.2, 'x', '/');
    await push.schedule(5000, 'x', '/');
    expect(api.schedule.mock.calls.map((c) => c[0].seconds)).toEqual([1, 3600]);
  });

  it('does nothing when it is not on, and ignores network errors', async () => {
    const off = setup({ stored: { status: 'declined' } });
    await off.push.schedule(90, 'x', '/');
    await off.push.cancel();
    expect(off.api.schedule).not.toHaveBeenCalled();
    expect(off.api.cancel).not.toHaveBeenCalled();

    const on = setup({ stored: ON });
    on.api.schedule.mockRejectedValue(new Error('offline'));
    on.api.cancel.mockRejectedValue(new Error('offline'));
    await expect(on.push.schedule(90, 'x', '/')).resolves.toBeUndefined();
    await expect(on.push.cancel()).resolves.toBeUndefined();
  });
});
