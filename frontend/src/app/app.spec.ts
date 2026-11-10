import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';
import { FONTS_READY } from './core/fonts';
import type { User } from './core/models/user';
import { SyncService } from './core/sync/sync.service';
import { WorkoutSessionService } from './core/workout/workout-session.service';

@Component({ template: '<p>pantalla</p>' })
class Screen {}

const user = signal<User | null | undefined>(undefined);
const sync = { start: vi.fn() };
const sessions = { restoreActive: vi.fn().mockResolvedValue(null) };

async function render(guard: () => Promise<boolean>, fonts: Promise<void> = Promise.resolve()) {
  user.set(undefined);
  sync.start.mockClear();
  sessions.restoreActive.mockClear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'hoy', component: Screen, canActivate: [guard] }]),
      { provide: HttpClient, useValue: { get: () => of(null) } },
      { provide: SyncService, useValue: sync },
      { provide: AuthService, useValue: { user } },
      { provide: FONTS_READY, useValue: fonts },
      { provide: WorkoutSessionService, useValue: sessions },
    ],
  });
  const fixture = TestBed.createComponent(App);
  void TestBed.inject(Router).navigateByUrl('/hoy');
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return fixture;
}

describe('App', () => {
  it('shows the animated logo while the first screen is not ready (the DB may be waking up)', async () => {
    const fixture = await render(() => new Promise<boolean>(() => undefined));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-boot-splash [aria-busy="true"]')).not.toBeNull();
    expect(el.textContent).toContain('Despertando el servidor');
  });

  it('removes the splash once the first screen is shown', async () => {
    const fixture = await render(() => Promise.resolve(true));
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[aria-busy="true"]')).toBeNull();
    expect(el.textContent).toContain('pantalla');
  });

  it('keeps the splash until the fonts are ready, so the first screen does not swap fonts', async () => {
    const fixture = await render(() => Promise.resolve(true), new Promise<void>(() => undefined));
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-boot-splash')).not.toBeNull();
  });

  it("waits for the signed-in user before syncing, so another account's pending changes are never sent", async () => {
    const fixture = await render(() => new Promise<boolean>(() => undefined));
    TestBed.tick();
    expect(sync.start).not.toHaveBeenCalled();
    expect(sessions.restoreActive).not.toHaveBeenCalled();

    user.set({ id: 1, name: 'Luciano', email: 'l@x.cl', demo_expires_at: null });
    TestBed.tick();
    expect(sync.start).toHaveBeenCalledTimes(1);
    expect(sessions.restoreActive).toHaveBeenCalledTimes(1);

    user.set({ id: 1, name: 'Luciano', email: 'l@x.cl', demo_expires_at: null });
    TestBed.tick();
    expect(sync.start).toHaveBeenCalledTimes(1);
  });
});
