import { describe, expect, it } from 'vitest';
import { firstName, greeting, initials } from './greeting';

describe('greeting', () => {
  it('depends on the hour in Santiago', () => {
    // Noviembre: Santiago está en UTC-3.
    expect(greeting(new Date('2026-11-04T11:00:00Z'))).toBe('Buenos días'); // 08:00
    expect(greeting(new Date('2026-11-04T17:00:00Z'))).toBe('Buenas tardes'); // 14:00
    expect(greeting(new Date('2026-11-05T01:30:00Z'))).toBe('Buenas noches'); // 22:30
    expect(greeting(new Date('2026-11-04T06:00:00Z'))).toBe('Buenas noches'); // 03:00
  });
});

describe('firstName', () => {
  it('takes the first word of the name', () => {
    expect(firstName('Luciano Grasso')).toBe('Luciano');
    expect(firstName('  Ana ')).toBe('Ana');
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Luciano Grasso Sadi')).toBe('LG');
    expect(initials(' ana ')).toBe('A');
    expect(initials('')).toBe('?');
  });
});
