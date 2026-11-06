import { Component } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import { SyncService } from '../../core/sync/sync.service';
import { RegisterPage } from './register-page';

@Component({ template: '' })
class Blank {}

async function render(opts: { preview?: () => Promise<unknown>; register?: () => Promise<unknown>; current?: unknown } = {}) {
  const auth = {
    loadUser: vi.fn().mockResolvedValue(opts.current ?? null),
    register: vi.fn(opts.register ?? (() => Promise.resolve({ id: 2, name: 'Pedro', email: 'p@x.cl' }))),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const invitations = { preview: vi.fn(opts.preview ?? (() => Promise.resolve({ inviter_name: 'Luciano', expires_at: 'x' }))) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'hoy', component: Blank }, { path: 'login', component: Blank }]),
      { provide: AuthService, useValue: auth },
      { provide: InvitationsApi, useValue: invitations },
      { provide: SyncService, useValue: { flush: vi.fn().mockResolvedValue(undefined) } },
    ],
  });
  const fixture = TestBed.createComponent(RegisterPage);
  fixture.componentRef.setInput('token', 'tok123');
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const type = (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const fillAndSubmit = async () => {
    type('name', 'Pedro');
    type('email', 'pedro@example.com');
    type('password', 'secret123');
    type('password_confirmation', 'secret123');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  };
  return { auth, invitations, el, fillAndSubmit };
}

describe('RegisterPage', () => {
  it('explains when the link is no longer valid', async () => {
    const { el } = await render({ preview: () => Promise.reject(new HttpErrorResponse({ status: 410 })) });
    expect(el.textContent).toContain('Este link de invitación ya no es válido');
  });

  it('registers with the invitation and opens the app', async () => {
    const { auth, el, fillAndSubmit } = await render();
    expect(el.textContent).toContain('Luciano te invitó a GymTracker');

    await fillAndSubmit();

    expect(auth.register).toHaveBeenCalledWith({
      token: 'tok123', name: 'Pedro', email: 'pedro@example.com', password: 'secret123', password_confirmation: 'secret123',
    });
    expect(TestBed.inject(Router).url).toBe('/hoy');
  });

  it('shows the server error under the email field', async () => {
    const error = new HttpErrorResponse({ status: 422, error: { errors: { email: ['Este correo ya tiene una cuenta.'] } } });
    const { el, fillAndSubmit } = await render({ register: () => Promise.reject(error) });

    await fillAndSubmit();

    expect(el.textContent).toContain('Este correo ya tiene una cuenta.');
  });

  it('does not mix accounts when someone is already signed in', async () => {
    const { el } = await render({ current: { id: 1, name: 'Luciano', email: 'l@x.cl' } });
    expect(el.textContent).toContain('Ya tienes una sesión iniciada');
  });
});
