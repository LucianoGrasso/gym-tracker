import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../core/models/exercise';
import type { LibraryExercise } from '../../core/models/library';
import { filterExercises, filterLibrary } from './filter-exercises';

const ex = (name: string, muscle_group: Exercise['muscle_group']): Exercise => ({
  id: Math.random(), name, muscle_group, secondary_muscles: [], equipment: 'barbell', is_unilateral: false,
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

const lib = (name: string, muscle_group: LibraryExercise['muscle_group'], equipment: LibraryExercise['equipment']): LibraryExercise => ({
  slug: name, name, muscle_group, secondary_muscles: [], equipment, is_unilateral: false, uses_bodyweight: false,
  owned_exercise_id: null,
});

const library = [
  lib('Sentadilla goblet', 'quads', 'kettlebell'),
  lib('Curl femoral', 'hamstrings', 'machine'),
  lib('Jalón al pecho', 'lats', 'cable'),
];

describe('filterLibrary', () => {
  it('finds by name, muscle or body region, ignoring accents', () => {
    expect(filterLibrary(library, 'jalon', null, null).map((e) => e.name)).toEqual(['Jalón al pecho']);
    expect(filterLibrary(library, 'femorales', null, null).map((e) => e.name)).toEqual(['Curl femoral']);
    expect(filterLibrary(library, 'pierna', null, null)).toHaveLength(2);
  });

  it('combines the muscle and equipment chips', () => {
    expect(filterLibrary(library, '', 'quads', null)).toHaveLength(1);
    expect(filterLibrary(library, '', null, 'cable').map((e) => e.name)).toEqual(['Jalón al pecho']);
    expect(filterLibrary(library, '', 'quads', 'cable')).toHaveLength(0);
  });
});
