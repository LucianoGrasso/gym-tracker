import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { WorkoutsApi } from '../../core/api/workouts-api';
import { HealthSummary } from './health-summary';

const none = { avg_heart_rate: null, max_heart_rate: null, active_calories: null };

async function render(...responses: object[]) {
  const get = vi.fn();
  for (const r of responses) get.mockResolvedValueOnce(r);
  TestBed.configureTestingModule({ providers: [{ provide: WorkoutsApi, useValue: { get } }] });
  const fixture = TestBed.createComponent(HealthSummary);
  fixture.componentRef.setInput('workoutId', 'w1');
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
  };
  await settle();
  return { el: fixture.nativeElement as HTMLElement, get, settle };
}

describe('HealthSummary', () => {
  it('shows average heart rate and calories, not the max', async () => {
    const { el, get } = await render({ avg_heart_rate: 128, max_heart_rate: 171, active_calories: 412 });
    expect(get).toHaveBeenCalledWith('w1');
    expect(el.textContent).toContain('128');
    expect(el.textContent).not.toContain('171');
    expect(el.textContent).toContain('412');
  });

  it('renders nothing without data', async () => {
    const { el } = await render(none);
    expect(el.querySelector('section')).toBeNull();
  });

  it('reloads when the app becomes visible again', async () => {
    const { el, get, settle } = await render(none, { ...none, active_calories: 300 });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(get).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('300');
  });
});
