import { describe, expect, it } from 'vitest';
import { formatBestE1rm, formatHeaviest, formatMostReps, formatRecentRecord } from './format-record';

describe('record formatting', () => {
  it('describes each record in spanish', () => {
    expect(formatHeaviest({ load_kg: 90, reps: 3, date: '2026-10-08' })).toBe('90 kg × 3');
    expect(formatBestE1rm({ e1rm_kg: 116.67, load_kg: 100, reps: 5, date: '2026-10-08' })).toBe('116,67 kg (100 kg × 5)');
    expect(formatMostReps({ reps: 31, load_kg: 42.5, date: '2026-10-08' })).toBe('31 reps con 42,5 kg');
    expect(formatMostReps({ reps: 8, load_kg: null, date: '2026-10-08' })).toBe('8 reps');
  });

  it('describes a recent record with its kind', () => {
    expect(
      formatRecentRecord({ exercise_id: 1, exercise_name: 'Press', type: 'heaviest', load_kg: 90, reps: 3, date: '2026-10-08' }),
    ).toBe('Récord de peso: 90 kg × 3');
    expect(
      formatRecentRecord({
        exercise_id: 1,
        exercise_name: 'Press',
        type: 'best_e1rm',
        e1rm_kg: 99.17,
        load_kg: 85,
        reps: 5,
        date: '2026-10-08',
      }),
    ).toBe('Mejor 1RM estimado: 99,17 kg (85 kg × 5)');
  });
});
