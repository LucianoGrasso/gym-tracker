import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { SyncService } from '../../core/sync/sync.service';
import { LoginPage } from './login-page';

@Component({ template: '' })
class Blank {}

async function render(startDemo: () => Promise<unknown>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'hoy', component: Blank }]),
      { provide: AuthService, useValue: { startDemo: vi.fn(startDemo), login: vi.fn() } },
      { provide: SyncService, useValue: { flush: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(LoginPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const demoButton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Probar demo'))!;
  return { fixture, el, demoButton };
}

describe('LoginPage demo', () => {
  it('starts a demo and goes to Hoy', async () => {
    const { fixture, demoButton } = await render(() => Promise.resolve({}));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    demoButton.click();
    await fixture.whenStable();

    expect(TestBed.inject(AuthService).startDemo).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/hoy');
  });

  it('explains when the demo is full or rate limited', async () => {
    const full = new HttpErrorResponse({ status: 503, error: { message: 'La demo está llena. Intenta en un rato.' } });
    const { fixture, el, demoButton } = await render(() => Promise.reject(full));
    demoButton.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('La demo está llena. Intenta en un rato.');
  });
});
