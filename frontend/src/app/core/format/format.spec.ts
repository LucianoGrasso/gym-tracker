import { describe, expect, it } from 'vitest';
import { formatDate, formatKg } from './format';

describe('formatKg', () => {
  it('uses a decimal comma', () => {
    expect(formatKg(42.5)).toBe('42,5 kg');
  });

  it('omits decimals for whole numbers', () => {
    expect(formatKg(40)).toBe('40 kg');
  });

  it('keeps up to two decimals', () => {
    expect(formatKg(1.25)).toBe('1,25 kg');
  });
});

describe('formatDate', () => {
  it('formats an ISO date as dd/mm/aaaa', () => {
    expect(formatDate('2026-11-03')).toBe('03/11/2026');
  });

  it('accepts a full ISO datetime and keeps the date part', () => {
    expect(formatDate('2026-01-09T23:30:00Z')).toBe('09/01/2026');
  });
});
