import { describe, expect, it } from 'vitest';
import { categoryLabel } from './labels';

describe('categoryLabel', () => {
  it('names cardio as such and strength by its primary muscle', () => {
    expect(categoryLabel({ kind: 'cardio', muscle_group: 'other' })).toBe('Cardio');
    expect(categoryLabel({ kind: 'strength', muscle_group: 'chest' })).toBe('Pecho');
    expect(categoryLabel({ muscle_group: 'other' })).toBe('Otro');
  });
});
