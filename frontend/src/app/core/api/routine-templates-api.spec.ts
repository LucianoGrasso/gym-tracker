import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoutineTemplate } from '../models/routine-template';
import { RoutineTemplatesApi } from './routine-templates-api';

const phul = { slug: 'phul', name: 'PHUL', days: [] } as unknown as RoutineTemplate;

describe('RoutineTemplatesApi', () => {
  let api: RoutineTemplatesApi;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(RoutineTemplatesApi);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('loads the catalog once and finds a template by slug', async () => {
    const first = api.list();
    mock.expectOne('/api/routine-templates').flush({ data: [phul] });
    expect(await first).toEqual([phul]);

    expect(await api.find('phul')).toEqual(phul);
    expect(await api.find('nope')).toBeUndefined();
    mock.expectNone('/api/routine-templates');
  });

  it('retries the catalog after a failure', async () => {
    const failed = api.list();
    mock.expectOne('/api/routine-templates').flush(null, { status: 500, statusText: 'Error' });
    await expect(failed).rejects.toBeTruthy();

    const retry = api.list();
    mock.expectOne('/api/routine-templates').flush({ data: [phul] });
    expect(await retry).toEqual([phul]);
  });

  it('imports a template and returns the new routine', async () => {
    const result = api.import('phul');
    const req = mock.expectOne('/api/routine-templates/phul/import');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { id: 42, name: 'PHUL', notes: null, is_active: false } }, { status: 201, statusText: 'Created' });
    expect((await result).id).toBe(42);
  });
});
