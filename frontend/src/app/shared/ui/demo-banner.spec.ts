import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import type { User } from '../../core/models/user';
import { DemoBanner } from './demo-banner';

@Component({ template: '' })
class Blank {}

const NOW = new Date('2026-11-10T20:00:00Z');

async function render(user: User) {
  const auth = { user: signal<User | null>(user), logout: vi.fn().mockResolvedValue(undefined) };
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'login', component: Blank }]), { provide: AuthService, useValue: auth }],
  });
  const fixture = TestBed.createComponent(DemoBanner);
  await fixture.whenStable();
  return { fixture, auth, el: fixture.nativeElement as HTMLElement };
}

const demo = (minutesLeft: number): User => ({
  id: 1,
  name: 'Invitado',
  email: 'demo@demo.invalid',
  demo_expires_at: new Date(NOW.getTime() + minutesLeft * 60_000).toISOString(),
});

describe('DemoBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('shows nothing for a real account', async () => {
    const { el } = await render({ id: 1, name: 'Luciano', email: 'l@x.cl', demo_expires_at: null });
    expect(el.textContent?.trim()).toBe('');
  });

  it('says how long the demo has left', async () => {
    const { el } = await render(demo(112));
    expect(el.textContent).toContain('Modo demo');
    expect(el.textContent).toContain('se borra en 1 h 52 min');
  });

  it('logs out with Salir', async () => {
    const { fixture, el, auth } = await render(demo(90));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Salir'))!.click();
    await fixture.whenStable();
    expect(auth.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('logs out by itself when the demo expires', async () => {
    const { auth } = await render(demo(1));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    await vi.advanceTimersByTimeAsync(61_000);
    expect(auth.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
