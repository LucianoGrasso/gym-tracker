import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { User } from '../models/user';

function setup(current: User | null | undefined, loaded: User | null = null) {
  const auth = { user: signal(current), loadUser: vi.fn().mockResolvedValue(loaded) };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const run = () =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  return { auth, run };
}

const user = { id: 1, name: 'Luciano', email: 'luciano@gymtracker.test', demo_expires_at: null };

describe('authGuard', () => {
  it('allows navigation when the user is known', async () => {
    const { auth, run } = setup(user);
    expect(await run()).toBe(true);
    expect(auth.loadUser).not.toHaveBeenCalled();
  });

  it('loads the user when unknown', async () => {
    const { auth, run } = setup(undefined, user);
    expect(await run()).toBe(true);
    expect(auth.loadUser).toHaveBeenCalledOnce();
  });

  it('redirects to /login instead of failing when the API errors', async () => {
    const { auth, run } = setup(undefined);
    auth.loadUser.mockRejectedValue(new Error('Http failure during parsing'));
    const result = await run();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('redirects guests to /login', async () => {
    const { run } = setup(null);
    const result = await run();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });
});
