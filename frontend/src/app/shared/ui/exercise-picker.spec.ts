import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../core/models/exercise';
import { ExercisePicker } from './exercise-picker';

const exercise = (id: number, name: string, muscle_group: Exercise['muscle_group']): Exercise => ({
  id,
  name,
  muscle_group,
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
