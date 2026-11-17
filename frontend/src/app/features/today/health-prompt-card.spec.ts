import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkoutsApi } from '../../core/api/workouts-api';
import { HealthStore } from '../../core/health/health-store';
import { OPEN_URL, RUN_SHORTCUT_URL } from '../../core/health/shortcut';
import { SyncService } from '../../core/sync/sync.service';
import { HealthPromptCard } from './health-prompt-card';

interface Opts {
  configured?: boolean;
  finishedOn?: string | null;
  online?: boolean;
  pending?: number;
  syncedAt?: string | null;
}

async function render(opts: Opts = {}) {
  const get = vi.fn().mockResolvedValue({ health_synced_at: opts.syncedAt ?? null });
  const openUrl = vi.fn();
  const sync = { online: signal(opts.online ?? true), pending: signal(opts.pending ?? 0) };
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkoutsApi, useValue: { get } },
      { provide: SyncService, useValue: sync },
      { provide: OPEN_URL, useValue: openUrl },
    ],
  });
  const store = TestBed.inject(HealthStore);
  store.setConfigured(opts.configured ?? true);
  const finishedOn = opts.finishedOn === undefined ? '2026-11-17' : opts.finishedOn;
  if (finishedOn) store.rememberFinished('w1', finishedOn);
  const fixture = TestBed.createComponent(HealthPromptCard);
  fixture.componentRef.setInput('today', '2026-11-17');
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label);
  return { el, get, openUrl, store, button, settle };
}

describe('HealthPromptCard', () => {
  afterEach(() => localStorage.clear());

  it('opens the shortcut after finishing today', async () => {
    const { button, openUrl } = await render();
    button('Traer FC y kcal de Salud')!.click();
    expect(openUrl).toHaveBeenCalledWith(RUN_SHORTCUT_URL);
  });

  it('stays hidden when the shortcut is not configured', async () => {
    const { el } = await render({ configured: false });
    expect(el.querySelector('section')).toBeNull();
  });

  it('stays hidden for a session of another day', async () => {
    const { el } = await render({ finishedOn: '2026-11-16' });
    expect(el.querySelector('section')).toBeNull();
  });

  it('waits while offline', async () => {
    const { el, button } = await render({ online: false });
    expect(button('Traer FC y kcal de Salud')!.disabled).toBe(true);
    expect(el.textContent).toContain('se completará con la sincronización nocturna');
  });

  it('waits while the session is still being sent', async () => {
    const { el, button, get } = await render({ pending: 2 });
    expect(button('Traer FC y kcal de Salud')!.disabled).toBe(true);
    expect(el.textContent).toContain('Enviando la sesión');
    expect(get).not.toHaveBeenCalled();
  });

  it('can be dismissed', async () => {
    const { el, button, store, settle } = await render();
    button('Ahora no')!.click();
    await settle();
    expect(store.lastFinished()).toBeNull();
    expect(el.querySelector('section')).toBeNull();
  });

  it('disappears once the server has the health data', async () => {
    const { el, store } = await render({ syncedAt: '2026-11-17T23:00:00+00:00' });
    expect(store.lastFinished()).toBeNull();
    expect(el.querySelector('section')).toBeNull();
  });
});
