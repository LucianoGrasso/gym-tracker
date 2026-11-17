import { describe, expect, it } from 'vitest';
import { formatHealth, hasHealth } from './health-format';

const none = { avg_heart_rate: null, max_heart_rate: null, active_calories: null };

describe('formatHealth', () => {
  it('joins average heart rate and calories', () => {
    expect(formatHealth({ avg_heart_rate: 128, max_heart_rate: 171, active_calories: 412 })).toBe('♥ 128 ppm · 412 kcal');
  });

  it('shows only what exists', () => {
    expect(formatHealth({ ...none, active_calories: 300 })).toBe('300 kcal');
  });

  it('returns null without data', () => {
    expect(formatHealth(none)).toBeNull();
    expect(hasHealth(none)).toBe(false);
    expect(hasHealth({ ...none, max_heart_rate: 150 })).toBe(true);
  });
});
