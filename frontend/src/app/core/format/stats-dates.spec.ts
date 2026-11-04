import { describe, expect, it } from 'vitest';
import { addDays, formatShortDate, localToday } from './format';

describe('stats date helpers', () => {
  it('formats a short day/month', () => {
    expect(formatShortDate('2026-11-03')).toBe('03/11');
  });

  it('adds days across months', () => {
    expect(addDays('2026-10-26', 6)).toBe('2026-11-01');
  });

  it('gives the Santiago date, not the UTC one', () => {
    expect(localToday(new Date('2026-11-09T02:00:00Z'))).toBe('2026-11-08');
  });
});
