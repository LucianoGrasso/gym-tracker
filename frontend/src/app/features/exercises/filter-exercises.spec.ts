import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../core/models/exercise';
import { filterExercises } from './filter-exercises';

const ex = (name: string, muscle_group: Exercise['muscle_group']): Exercise => ({
  id: Math.random(), name, muscle_group, equipment: 'barbell', is_unilateral: false,
  uses_bodyweight: false, notes: null, archived_at: null,
});

const list = [ex('Jalón al pecho', 'lats'), ex('Press de banca', 'chest'), ex('Press militar', 'shoulders')];

describe('filterExercises', () => {
  it('returns everything without filters', () => {
    expect(filterExercises(list, '', null)).toHaveLength(3);
  });
  it('matches ignoring case and accents', () => {
    expect(filterExercises(list, 'jalon', null).map((e) => e.name)).toEqual(['Jalón al pecho']);
    expect(filterExercises(list, 'PRESS', null)).toHaveLength(2);
  });
  it('combines search and muscle group', () => {
    expect(filterExercises(list, 'press', 'chest').map((e) => e.name)).toEqual(['Press de banca']);
  });
});
