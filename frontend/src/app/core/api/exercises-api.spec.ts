import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExercisesApi } from './exercises-api';

describe('ExercisesApi', () => {
  let api: ExercisesApi;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ExercisesApi);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('lists archived exercises and unwraps data', async () => {
    const result = api.list({ archived: true });
    const req = mock.expectOne((r) => r.url === '/api/exercises');
    expect(req.request.params.get('archived')).toBe('1');
    req.flush({ data: [{ id: 1, name: 'Dominadas' }] });

    expect(await result).toEqual([{ id: 1, name: 'Dominadas' }]);
  });

  it('archives an exercise', async () => {
    const result = api.archive(7);
    const req = mock.expectOne('/api/exercises/7/archive');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { id: 7, archived_at: '2026-11-03T12:00:00+00:00' } });

    expect((await result).archived_at).not.toBeNull();
  });
});
