import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ExercisesApi } from '../../core/api/exercises-api';
import { ExerciseFormPage, toggleSecondary } from './exercise-form-page';

describe('toggleSecondary', () => {
  it('adds and removes a muscle, never the primary and at most four', () => {
    expect(toggleSecondary([], 'triceps', 'chest')).toEqual(['triceps']);
    expect(toggleSecondary(['triceps'], 'triceps', 'chest')).toEqual([]);
    expect(toggleSecondary([], 'chest', 'chest')).toEqual([]);
    expect(toggleSecondary(['triceps', 'shoulders', 'core', 'lats'], 'biceps', 'chest')).toEqual([
      'triceps',
      'shoulders',
      'core',
      'lats',
    ]);
  });
});

describe('ExerciseFormPage', () => {
  async function setup() {
    const api = { create: vi.fn().mockResolvedValue({ id: 9 }), update: vi.fn(), get: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ExercisesApi, useValue: api }],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ExerciseFormPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const chip = (label: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('[data-secondary]')).find(
        (b) => b.textContent!.trim() === label,
      )!;
    return { fixture, el, api, chip };
  }

  it('picks secondary muscles with chips, the primary one disabled, and saves them', async () => {
    const { fixture, el, api, chip } = await setup();

    expect(chip('Pecho').disabled).toBe(true);
    chip('Tríceps').click();
    chip('Hombros').click();
    await fixture.whenStable();
    expect(chip('Tríceps').getAttribute('aria-pressed')).toBe('true');

    const name = el.querySelector<HTMLInputElement>('#name')!;
    name.value = 'Press raro';
    name.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ secondary_muscles: ['triceps', 'shoulders'] }),
    );
  });

  it('drops a secondary muscle that becomes the primary one', async () => {
    const { fixture, el, chip } = await setup();
    chip('Tríceps').click();
    await fixture.whenStable();

    const select = el.querySelector<HTMLSelectElement>('#muscle_group')!;
    select.value =
      select.options[Array.from(select.options).findIndex((o) => o.text === 'Tríceps')].value;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(chip('Tríceps').disabled).toBe(true);
    expect(chip('Tríceps').getAttribute('aria-pressed')).toBe('false');
  });

  it('hides the muscles for a cardio exercise and saves its kind', async () => {
    const { fixture, el, api } = await setup();
    const kind = el.querySelector<HTMLSelectElement>('#kind')!;
    kind.value = kind.options[1].value;
    kind.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(el.querySelector('#muscle_group')).toBeNull();
    expect(el.querySelector('[data-secondary]')).toBeNull();
    expect(el.textContent).not.toContain('Unilateral');

    const name = el.querySelector<HTMLInputElement>('#name')!;
    name.value = 'Caminata';
    name.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'cardio' }));
  });

  it('locks the kind of an exercise with history', async () => {
    const api = {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn().mockResolvedValue({
        id: 3, name: 'Press', kind: 'strength', muscle_group: 'chest', secondary_muscles: [], equipment: 'barbell',
        is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null, has_history: true,
      }),
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ExercisesApi, useValue: api }] });
    const fixture = TestBed.createComponent(ExerciseFormPage);
    fixture.componentRef.setInput('id', '3');
    await fixture.whenStable();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#kind')!.disabled).toBe(true);
  });
});
