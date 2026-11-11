import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LibraryExercise } from '../models/library';
import { ExerciseLibraryApi } from './exercise-library-api';

const bench = { slug: 'press-de-banca', name: 'Press de banca' } as LibraryExercise;

describe('ExerciseLibraryApi', () => {
  let api: ExerciseLibraryApi;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ExerciseLibraryApi);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('lists the library', async () => {
    const list = api.list();
    mock.expectOne('/api/exercise-library').flush({ data: [bench] });
    expect(await list).toEqual([bench]);
  });

  it('adds a library exercise to the user', async () => {
    const adopted = api.adopt('press-de-banca');
    const req = mock.expectOne('/api/exercises/from-library');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ slug: 'press-de-banca' });
    req.flush({ data: { id: 7, name: 'Press de banca' } });
    expect((await adopted).id).toBe(7);
  });
});
