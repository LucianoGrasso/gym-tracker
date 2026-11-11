import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmService } from './confirm-dialog';

const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]');
const button = (text: string) =>
  Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent!.trim() === text)!;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('ConfirmService', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('asks inside the app and resolves true when confirmed', async () => {
    const answer = TestBed.inject(ConfirmService).ask({
      title: '¿Eliminar la rutina?',
      message: 'El historial se conserva.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    await settle();

    expect(dialog()!.textContent).toContain('¿Eliminar la rutina?');
    expect(dialog()!.textContent).toContain('El historial se conserva.');
    expect(button('Eliminar').className).toContain('bg-destructive');

    button('Eliminar').click();
    expect(await answer).toBe(true);
  });

  it('resolves false when cancelled', async () => {
    const answer = TestBed.inject(ConfirmService).ask({ title: '¿Borrar esta serie?', confirmLabel: 'Borrar' });
    await settle();

    button('Cancelar').click();
    expect(await answer).toBe(false);
  });

  it('resolves false with Escape', async () => {
    const answer = TestBed.inject(ConfirmService).ask({ title: '¿Borrar esta serie?', confirmLabel: 'Borrar' });
    await settle();

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    Object.defineProperty(escape, 'keyCode', { value: 27 }); // el CDK revisa keyCode
    dialog()!.dispatchEvent(escape);
    expect(await answer).toBe(false);
  });
});
