import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseLibraryApi } from '../../core/api/exercise-library-api';
import { LOCAL_DB, LocalDb } from '../../core/local-db/local-db';
import type { LibraryExercise } from '../../core/models/library';
import type { Exercise } from '../../core/models/exercise';
import { ExercisePicker } from './exercise-picker';

const exercise = (id: number, name: string, muscle_group: Exercise['muscle_group']): Exercise => ({
  id,
  name,
  muscle_group,
  secondary_muscles: [],
  equipment: 'barbell',
  is_unilateral: false,
  uses_bodyweight: false,
  notes: null,
  archived_at: null,
});

const EXERCISES = [
  exercise(1, 'Press de banca', 'chest'),
  exercise(2, 'Extensión de tríceps en polea', 'triceps'),
  exercise(3, 'Sentadilla', 'quads'),
  exercise(4, 'Press militar', 'shoulders'),
];

async function setup(value: number | null = null) {
  const fixture = TestBed.createComponent(ExercisePicker);
  fixture.componentRef.setInput('exercises', EXERCISES);
  fixture.componentRef.setInput('value', value);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const names = () =>
    Array.from(el.querySelectorAll('[role=option] .name')).map((n) => n.textContent?.trim());
  const search = async (text: string) => {
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  return { fixture, el, names, search };
}

describe('ExercisePicker', () => {
  it('lists every exercise with its muscle group', async () => {
    const { el, names } = await setup();
    expect(names()).toEqual([
      'Press de banca',
      'Extensión de tríceps en polea',
      'Sentadilla',
      'Press militar',
    ]);
    expect(el.textContent).toContain('Pecho');
  });

  it('filters ignoring accents and case, word by word', async () => {
    const { names, search } = await setup();

    await search('TRICEPS');
    expect(names()).toEqual(['Extensión de tríceps en polea']);

    await search('press ban');
    expect(names()).toEqual(['Press de banca']);
  });

  it('also finds exercises by muscle group', async () => {
    const { names, search } = await setup();
    await search('pierna');
    expect(names()).toEqual(['Sentadilla']);
  });

  it('says when nothing matches', async () => {
    const { el, names, search } = await setup();
    await search('remo');
    expect(names()).toEqual([]);
    expect(el.textContent).toContain('Sin resultados para «remo»');
  });

  it('collapses to the chosen exercise after a tap, so it is clear what was picked', async () => {
    const { fixture, el, search } = await setup();
    await search('press');
    el.querySelector<HTMLButtonElement>('[role=option]')?.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.value()).toBe(1);
    expect(el.querySelector('[role=listbox]')).toBeNull();
    expect(el.querySelector('input')).toBeNull();
    const picked = el.querySelector('.picked');
    expect(picked?.textContent).toContain('Press de banca');
    expect(picked?.textContent).toContain('Pecho');
    expect(picked?.classList).toContain('set-saved');
  });

  it('reopens the search with Cambiar, marking the current choice', async () => {
    const { fixture, el, names } = await setup(3);
    expect(el.querySelector('.picked')?.textContent).toContain('Sentadilla');

    const change = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Cambiar'));
    change?.click();
    await fixture.whenStable();

    expect(names()).toHaveLength(4);
    expect(el.querySelector('[aria-selected=true] .name')?.textContent?.trim()).toBe('Sentadilla');
    expect(el.querySelector('input')?.value).toBe('');
    el.querySelector<HTMLButtonElement>('[aria-selected=true]')?.click();
    await fixture.whenStable();
    expect(el.querySelector('[role=listbox]')).toBeNull();
  });
});

describe('ExercisePicker with the library', () => {
  const lib = (slug: string, name: string, owned: number | null = null): LibraryExercise => ({
    slug, name, muscle_group: 'glutes', secondary_muscles: [], equipment: 'barbell', is_unilateral: false,
    uses_bodyweight: false, owned_exercise_id: owned,
  });

  async function setupLibrary(adopt = vi.fn().mockResolvedValue(exercise(50, 'Hip thrust', 'glutes'))) {
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCAL_DB, useValue: new LocalDb(`test-${crypto.randomUUID()}`) },
        {
          provide: ExerciseLibraryApi,
          useValue: {
            list: vi.fn().mockResolvedValue([
              lib('press-de-banca', 'Press de banca', 1),
              lib('sentadilla', 'Sentadilla'),
              lib('hip-thrust', 'Hip thrust'),
            ]),
            adopt,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ExercisePicker);
    fixture.componentRef.setInput('exercises', EXERCISES);
    fixture.componentRef.setInput('withLibrary', true);
    const adopted: Exercise[] = [];
    fixture.componentInstance.adopted.subscribe((e) => adopted.push(e));
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const libraryNames = () => Array.from(el.querySelectorAll('[data-library] .name')).map((n) => n.textContent?.trim());
    return { fixture, el, adopted, adopt, libraryNames };
  }

  it('lists the library after my exercises, without the ones I already have', async () => {
    const { el, libraryNames } = await setupLibrary();

    expect(el.textContent).toContain('Biblioteca');
    expect(libraryNames()).toEqual(['Hip thrust']);
  });

  it('adds a library exercise to mine when chosen and selects it', async () => {
    const { fixture, el, adopted, adopt } = await setupLibrary();

    el.querySelector<HTMLButtonElement>('[data-library]')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();

    expect(adopt).toHaveBeenCalledWith('hip-thrust');
    expect(fixture.componentInstance.value()).toBe(50);
    expect(adopted.map((e) => e.id)).toEqual([50]);
    expect(el.querySelector('.picked')!.textContent).toContain('Hip thrust');
  });

  it('explains that adding from the library needs a connection', async () => {
    const { fixture, el } = await setupLibrary(vi.fn().mockRejectedValue(new Error('offline')));

    el.querySelector<HTMLButtonElement>('[data-library]')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();

    expect(el.querySelector('[role=alert]')!.textContent).toContain(
      'Necesitas conexión para agregar un ejercicio nuevo de la biblioteca',
    );
    expect(fixture.componentInstance.value()).toBeNull();
  });
});
