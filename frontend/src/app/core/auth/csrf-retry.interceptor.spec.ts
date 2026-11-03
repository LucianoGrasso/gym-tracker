import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpXsrfTokenExtractor, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { csrfRetryInterceptor } from './csrf-retry.interceptor';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('csrfRetryInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfRetryInterceptor])),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => 'fresh-token' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('refreshes the CSRF cookie and retries once on 419', async () => {
    const result = firstValueFrom(http.post('/api/routines', { name: 'x' }));

    mock.expectOne('/api/routines').flush({ message: 'CSRF token mismatch.' }, { status: 419, statusText: 'Expired' });
    mock.expectOne('/sanctum/csrf-cookie').flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    const retry = mock.expectOne('/api/routines');
    expect(retry.request.headers.get('X-XSRF-TOKEN')).toBe('fresh-token');
    retry.flush({ data: { id: 1 } });

    expect(await result).toEqual({ data: { id: 1 } });
  });

  it('does not retry twice', async () => {
    const result = firstValueFrom(http.post('/api/routines', {}));

    mock.expectOne('/api/routines').flush(null, { status: 419, statusText: 'Expired' });
    mock.expectOne('/sanctum/csrf-cookie').flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    mock.expectOne('/api/routines').flush(null, { status: 419, statusText: 'Expired' });

    await expect(result).rejects.toMatchObject({ status: 419 });
  });

  it('passes other errors through', async () => {
    const result = firstValueFrom(http.get('/api/today'));
    mock.expectOne('/api/today').flush(null, { status: 500, statusText: 'Error' });
    await expect(result).rejects.toMatchObject({ status: 500 });
  });
});
