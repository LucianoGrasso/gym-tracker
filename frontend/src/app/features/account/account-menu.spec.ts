import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import type { Invitation } from '../../core/models/invitation';
import type { PushStatus } from '../../core/models/push';
import { PushService } from '../../core/push/push.service';
import { AccountMenu } from './account-menu';

@Component({ template: '' })
class Blank {}

const pendingInvitation = (id: number): Invitation => ({
  id,
  expires_at: 'x',
  expires_on: '2026-11-13',
});

function setNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

async function render(
  pending: Invitation[] = [],
  pushStatus: PushStatus = 'unsupported',
  demoExpiresAt: string | null = null,
) {
  const api = {
    list: vi.fn().mockResolvedValue(pending),
    create: vi.fn().mockResolvedValue({ ...pendingInvitation(9), token: 'tok123' }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const auth = {
    user: signal({ id: 1, name: 'Luciano Grasso', email: 'l@x.cl', demo_expires_at: demoExpiresAt }),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const push = {
    status: signal<PushStatus>(pushStatus),
    enable: vi.fn().mockResolvedValue(true),
    disable: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'login', component: Blank }]),
      { provide: InvitationsApi, useValue: api },
      { provide: AuthService, useValue: auth },
      { provide: PushService, useValue: push },
    ],
  });
  const fixture = TestBed.createComponent(AccountMenu);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;
  const open = async () => {
    button('Mi cuenta').click();
    await settle();
  };
  return { api, auth, el, settle, button, open, push };
}

describe('AccountMenu', () => {
  afterEach(() => setNavigator({ share: undefined, clipboard: undefined }));

  it('opens from "Mi cuenta" with the user details and closes with Escape', async () => {
    const { el, settle, button, open } = await render();
    expect(el.querySelector('[role="menu"]')).toBeNull();

    await open();
    expect(button('Mi cuenta').getAttribute('aria-expanded')).toBe('true');
    expect(el.textContent).toContain('Luciano Grasso');
    expect(el.textContent).toContain('l@x.cl');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  it('closes when tapping outside', async () => {
    const { el, settle, open } = await render();
    await open();

    document.body.click();
    await settle();

    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  it('shares the new invitation link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share });
    const { el, settle, button, open } = await render();
    await open();

    button('Invitar a alguien').click();
    await settle();

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('/registro/tok123') }),
    );
    expect(el.textContent).toContain('Vence el 13/11/2026');
  });

  it('copies the link when sharing is not available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share: undefined, clipboard: { writeText } });
    const { el, settle, button, open } = await render();
    await open();

    button('Invitar a alguien').click();
    await settle();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/registro/tok123'));
    expect(el.textContent).toContain('Link copiado');
  });

  it('stops inviting at five pending invitations', async () => {
    const { el, button, open } = await render([1, 2, 3, 4, 5].map(pendingInvitation));
    await open();

    expect(button('Invitar a alguien').disabled).toBe(true);
    expect(el.textContent).toContain('Tienes 5 invitaciones pendientes');
  });

  it('revokes a pending invitation', async () => {
    const { api, el, settle, button, open } = await render([pendingInvitation(7)]);
    await open();

    button('Anular').click();
    await settle();

    expect(api.revoke).toHaveBeenCalledWith(7);
    expect(el.textContent).not.toContain('Vence el');
  });

  it('signs out and goes to the login', async () => {
    const { auth, settle, button, open } = await render();
    await open();

    button('Cerrar sesión').click();
    await settle();

    expect(auth.logout).toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  describe('rest notifications', () => {
    const toggle = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[role="switch"]')!;

    it('turns them on from the switch', async () => {
      const { el, open, settle, push } = await render([], 'declined');
      await open();
      expect(toggle(el).getAttribute('aria-checked')).toBe('false');

      toggle(el).click();
      await settle();
      expect(push.enable).toHaveBeenCalled();
    });

    it('turns them off from the switch', async () => {
      const { el, open, settle, push } = await render([], 'on');
      await open();
      expect(toggle(el).getAttribute('aria-checked')).toBe('true');

      toggle(el).click();
      await settle();
      expect(push.disable).toHaveBeenCalled();
    });

    it('explains how to get them on an iPhone without the installed app', async () => {
      const { el, open } = await render([], 'unsupported');
      await open();
      expect(toggle(el).disabled).toBe(true);
      expect(el.textContent).toContain('instala la app en tu pantalla de inicio');
    });

    it('explains how to unblock them', async () => {
      const { el, open } = await render([], 'blocked');
      await open();
      expect(toggle(el).disabled).toBe(true);
      expect(el.textContent).toContain('Actívalas en Ajustes del teléfono');
    });
  });

  it('hides invitations for a demo account', async () => {
    const { el, open, api } = await render([], 'unsupported', '2026-11-10T22:00:00Z');
    await open();
    expect(el.textContent).not.toContain('Invitar a alguien');
    expect(api.list).not.toHaveBeenCalled();
  });
});
