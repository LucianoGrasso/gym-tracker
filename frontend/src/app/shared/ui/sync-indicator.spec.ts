import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SyncService } from '../../core/sync/sync.service';
import type { SyncState } from '../../core/sync/sync-label';
import { SyncIndicator } from './sync-indicator';

async function render(state: SyncState, pending = 0, failed = 0, online = true) {
  const sync = {
    online: signal(online),
    state: signal(state),
    pending: signal(pending),
    failed: signal(failed),
    retryFailed: vi.fn(),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SyncService, useValue: sync }],
  });
  const fixture = TestBed.createComponent(SyncIndicator);
  await fixture.whenStable();
  return { sync, el: fixture.nativeElement as HTMLElement };
}

describe('SyncIndicator', () => {
  it('stays hidden while everything is synced or syncing', async () => {
    expect((await render('idle')).el.textContent?.trim()).toBe('');
    expect((await render('syncing', 2)).el.textContent?.trim()).toBe('');
  });

  it('warns when offline with pending changes', async () => {
    const { el } = await render('offline', 2);
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'Sin conexión · 2 pendientes',
    );
  });

  it('asks to log in on auth errors', async () => {
    const { el } = await render('auth', 1);
    expect(el.querySelector('a')?.textContent).toContain('Entrar');
  });

  it('offers to retry failed changes', async () => {
    const { el, sync } = await render('error', 0, 2);
    expect(el.textContent).toContain('2 cambios no se pudieron guardar');
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reintentar'))!
      .click();
    expect(sync.retryFailed).toHaveBeenCalled();
  });

  it('warns as soon as the browser goes offline, even with nothing pending', async () => {
    const { el } = await render('idle', 0, 0, false);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Sin conexión');
  });
});
