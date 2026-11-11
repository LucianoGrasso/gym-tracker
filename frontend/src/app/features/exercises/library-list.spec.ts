import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseLibraryApi } from '../../core/api/exercise-library-api';
import { LOCAL_DB, LocalDb } from '../../core/local-db/local-db';
import type { LibraryExercise } from '../../core/models/library';
import { LibraryList } from './library-list';

const lib = (
  name: string,
  muscle_group: LibraryExercise['muscle_group'],
  equipment: LibraryExercise['equipment'],
  owned: number | null = null,
): LibraryExercise => ({
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  muscle_group,
  secondary_muscles: [],
  equipment,
  is_unilateral: false,
  uses_bodyweight: false,
  owned_exercise_id: owned,
});

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOCAL_DB, useValue: new LocalDb(`test-${crypto.randomUUID()}`) },
      {
        provide: ExerciseLibraryApi,
        useValue: {
          list: vi
            .fn()
            .mockResolvedValue([
              lib('Press de banca', 'chest', 'barbell', 3),
              lib('Sentadilla goblet', 'quads', 'kettlebell'),
              lib('Jalon al pecho', 'lats', 'cable'),
            ]),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(LibraryList);
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const names = () =>
    Array.from(el.querySelectorAll('[data-name]')).map((n) => n.textContent!.trim());
  const chip = (label: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label)!;
  return { fixture, el, names, chip };
}

describe('LibraryList', () => {
  it('lists the library with its schema, marking the exercises already in use', async () => {
    const { el, names } = await setup();

    expect(names()).toEqual(['Press de banca', 'Sentadilla goblet', 'Jalon al pecho']);
    expect(el.querySelectorAll('app-mini-body-map')).toHaveLength(3);
    expect(el.querySelectorAll('[data-owned]')).toHaveLength(1);
    expect(el.querySelector('a[href="/ejercicios/biblioteca/press-de-banca"]')).not.toBeNull();
  });

  it('filters by search and equipment', async () => {
    const { fixture, el, names, chip } = await setup();

    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'pierna';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names()).toEqual(['Sentadilla goblet']);

    input.value = '';
    input.dispatchEvent(new Event('input'));
    chip('Polea').click();
    await fixture.whenStable();
    expect(names()).toEqual(['Jalon al pecho']);
  });
});
