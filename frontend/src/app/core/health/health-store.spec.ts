import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { HealthStore } from './health-store';

describe('HealthStore', () => {
  afterEach(() => localStorage.clear());

  it('persists the configured flag and the last finished session', () => {
    const store = TestBed.inject(HealthStore);
    store.setConfigured(true);
    store.rememberFinished('w1', '2026-11-17');

    TestBed.resetTestingModule();
    const fresh = TestBed.inject(HealthStore);
    expect(fresh.configured()).toBe(true);
    expect(fresh.lastFinished()).toEqual({ id: 'w1', date: '2026-11-17' });
  });

  it('forgets the session and the flag', () => {
    const store = TestBed.inject(HealthStore);
    store.setConfigured(true);
    store.rememberFinished('w1', '2026-11-17');
    store.forgetFinished();
    store.setConfigured(false);

    expect(store.lastFinished()).toBeNull();
    expect(localStorage.getItem('gt.health.configured')).toBeNull();
    expect(localStorage.getItem('gt.health.last')).toBeNull();
  });

  it('ignores corrupt stored data', () => {
    localStorage.setItem('gt.health.last', '{oops');
    expect(TestBed.inject(HealthStore).lastFinished()).toBeNull();
  });
});
