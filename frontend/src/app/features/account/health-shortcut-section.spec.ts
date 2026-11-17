import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthApi } from '../../core/api/health-api';
import { HealthStore } from '../../core/health/health-store';
import { ConfirmService } from '../../shared/ui/confirm-dialog';
import { HealthShortcutSection } from './health-shortcut-section';

async function render(opts: { configured?: boolean; confirm?: boolean; fail?: boolean } = {}) {
  const api = {
    createToken: opts.fail ? vi.fn().mockRejectedValue(new Error('x')) : vi.fn().mockResolvedValue('7|abc'),
    revokeToken: vi.fn().mockResolvedValue(undefined),
  };
  const confirm = { ask: vi.fn().mockResolvedValue(opts.confirm ?? true) };
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  TestBed.configureTestingModule({
    providers: [
      { provide: HealthApi, useValue: api },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const store = TestBed.inject(HealthStore);
  store.setConfigured(opts.configured ?? false);
  const fixture = TestBed.createComponent(HealthShortcutSection);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label);
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
  };
  return { el, api, confirm, store, writeText, button, settle };
}

describe('HealthShortcutSection', () => {
  afterEach(() => localStorage.clear());

  it('generates a token, shows it once and marks the shortcut as configured', async () => {
    const { el, api, store, button, settle, writeText } = await render();
    button('Generar token')!.click();
    await settle();

    expect(api.createToken).toHaveBeenCalled();
    expect(el.querySelector('code')!.textContent).toBe('7|abc');
    expect(store.configured()).toBe(true);

    button('Copiar')!.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('7|abc');
    expect(el.textContent).toContain('Token copiado');
  });

  it('disconnects after confirming', async () => {
    const { api, confirm, store, button, settle } = await render({ configured: true });
    expect(button('Generar otro token')).toBeTruthy();
    button('Desconectar')!.click();
    await settle();

    expect(confirm.ask).toHaveBeenCalled();
    expect(api.revokeToken).toHaveBeenCalled();
    expect(store.configured()).toBe(false);
  });

  it('keeps the token when the confirmation is cancelled', async () => {
    const { api, button, settle } = await render({ configured: true, confirm: false });
    button('Desconectar')!.click();
    await settle();
    expect(api.revokeToken).not.toHaveBeenCalled();
  });

  it('shows an error when the token cannot be created', async () => {
    const { el, button, settle } = await render({ fail: true });
    button('Generar token')!.click();
    await settle();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('No se pudo generar el token');
  });
});
