import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';

const user = { id: 1, name: 'Luciano', email: 'luciano@gymtracker.test' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts with an unknown user', () => {
    expect(service.user()).toBeUndefined();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('loads the current user', async () => {
    const result = service.loadUser();
    http.expectOne('/api/user').flush({ data: user });

    expect(await result).toEqual(user);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('sets the user to null on 401', async () => {
    const result = service.loadUser();
    http.expectOne('/api/user').flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });

    expect(await result).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('requests the CSRF cookie before logging in', async () => {
    const result = service.login('luciano@gymtracker.test', 'secret123');

    http.expectOne('/sanctum/csrf-cookie').flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    const login = http.expectOne('/auth/login');
    expect(login.request.method).toBe('POST');
    expect(login.request.body).toEqual({ email: 'luciano@gymtracker.test', password: 'secret123' });
    login.flush({ data: user });

    expect(await result).toEqual(user);
    expect(service.user()).toEqual(user);
  });

  it('clears the user on logout', async () => {
    const loaded = service.loadUser();
    http.expectOne('/api/user').flush({ data: user });
    await loaded;

    const result = service.logout();
    http.expectOne('/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await result;

    expect(service.user()).toBeNull();
  });

  it('registers with an invitation and keeps the session', async () => {
    const input = {
      token: 'tok', name: 'Pedro', email: 'pedro@example.com', password: 'secret123', password_confirmation: 'secret123',
    };
    const result = service.register(input);
    http.expectOne('/sanctum/csrf-cookie').flush(null);
    await tick();
    const req = http.expectOne('/auth/register');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush({ data: user });

    expect(await result).toEqual(user);
    expect(service.user()).toEqual(user);
  });
});
