import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_DB, LocalDb } from '../local-db/local-db';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  let sync: SyncService;
  let db: LocalDb;
  let mock: HttpTestingController;

  beforeEach(() => {
    db = new LocalDb(`test-${crypto.randomUUID()}`);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LOCAL_DB, useValue: db }],
    });
    sync = TestBed.inject(SyncService);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  const next = (url: string) => vi.waitFor(() => mock.expectOne(url));

  it('sends queued operations in order and empties the outbox', async () => {
    await sync.enqueue('PUT', '/api/workouts/a', { date: '2026-11-03' });
    await sync.enqueue('PUT', '/api/workout-sets/b', { reps: 5 });

    const first = await next('/api/workouts/a');
    expect(first.request.method).toBe('PUT');
    expect(first.request.body).toEqual({ date: '2026-11-03' });
    first.flush({ data: {} });
    (await next('/api/workout-sets/b')).flush({ data: {} });

    await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0));
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    expect(sync.pending()).toBe(0);
  });

  it('keeps the operation and reports offline on network errors', async () => {
    await sync.enqueue('DELETE', '/api/workout-sets/x');

    (await next('/api/workout-sets/x')).error(new ProgressEvent('error'), { status: 0 });

    await vi.waitFor(() => expect(sync.state()).toBe('offline'));
    expect(sync.pending()).toBe(1);
    const [op] = await db.outbox.toArray();
    expect(op.attempts).toBe(1);
    expect(op.failed).toBe(false);
  });

  it('marks validation errors as failed and continues', async () => {
    await sync.enqueue('PUT', '/api/workout-sets/bad', { reps: -1 });
    await sync.enqueue('PUT', '/api/workout-sets/good', { reps: 5 });

    (await next('/api/workout-sets/bad')).flush(
      { message: 'x', errors: { reps: ['Reps inválidas.'] } },
      { status: 422, statusText: 'Unprocessable' },
    );
    (await next('/api/workout-sets/good')).flush({ data: {} });

    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(sync.failed()).toBe(1);
    const [op] = await db.outbox.toArray();
    expect(op.url).toBe('/api/workout-sets/bad');
    expect(op.lastError).toBe('Reps inválidas.');
  });

  it('stops and asks for login on 401', async () => {
    await sync.enqueue('PUT', '/api/workouts/a', {});
    await sync.enqueue('PUT', '/api/workouts/b', {});

    (await next('/api/workouts/a')).flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });

    await vi.waitFor(() => expect(sync.state()).toBe('auth'));
    expect(sync.pending()).toBe(2);
  });
});
