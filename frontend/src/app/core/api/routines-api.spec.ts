import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoutinesApi } from './routines-api';

describe('RoutinesApi', () => {
  let api: RoutinesApi;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(RoutinesApi);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('reorders days with a list of ids', async () => {
    const result = api.reorderDays(3, [9, 8]);
    const req = mock.expectOne('/api/routines/3/days/reorder');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ids: [9, 8] });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
  });

  it('adds an exercise to a day', async () => {
    const input = {
      exercise_id: 2, target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_text: null,
      default_set_type: 'normal' as const, rest_seconds: 120, notes: null,
    };
    const result = api.addExercise(5, input);
    const req = mock.expectOne('/api/routine-days/5/exercises');
    expect(req.request.body).toEqual(input);
    req.flush({ data: { id: 11 } });
    expect((await result).id).toBe(11);
  });
});
