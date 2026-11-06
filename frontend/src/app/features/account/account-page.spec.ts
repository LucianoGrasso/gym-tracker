import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import type { Invitation } from '../../core/models/invitation';
import { AccountPage } from './account-page';

@Component({ template: '' })
class Blank {}

const pendingInvitation = (id: number): Invitation => ({ id, expires_at: 'x', expires_on: '2026-11-13' });

function setNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

async function render(pending: Invitation[] = []) {
  const api = {
    list: vi.fn().mockResolvedValue(pending),
    create: vi.fn().mockResolvedValue({ ...pendingInvitation(9), token: 'tok123' }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'login', component: Blank }]),
      { provide: InvitationsApi, useValue: api },
      {
        provide: AuthService,
        useValue: { user: signal({ id: 1, name: 'Luciano', email: 'l@x.cl' }), logout: vi.fn().mockResolvedValue(undefined) },
      },
    ],
  });
  const fixture = TestBed.createComponent(AccountPage);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const button = (label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;
  return { api, el, settle, button };
}

describe('AccountPage', () => {
  afterEach(() => setNavigator({ share: undefined, clipboard: undefined }));

  it('shares the new invitation link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share });
    const { el, settle, button } = await render();

    button('Invitar a alguien').click();
    await settle();

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/registro/tok123') }));
    expect(el.textContent).toContain('Vence el 13/11/2026');
  });

  it('copies the link when sharing is not available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share: undefined, clipboard: { writeText } });
    const { el, settle, button } = await render();

    button('Invitar a alguien').click();
    await settle();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/registro/tok123'));
    expect(el.textContent).toContain('Link copiado');
  });

  it('stops inviting at five pending invitations', async () => {
    const { el, button } = await render([1, 2, 3, 4, 5].map(pendingInvitation));

    expect(button('Invitar a alguien').disabled).toBe(true);
    expect(el.textContent).toContain('Tienes 5 invitaciones pendientes');
  });

  it('revokes a pending invitation', async () => {
    const { api, el, settle, button } = await render([pendingInvitation(7)]);

    button('Anular').click();
    await settle();

    expect(api.revoke).toHaveBeenCalledWith(7);
    expect(el.textContent).not.toContain('Vence el');
  });
});
