import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../core/models/exercise';
import type { RoutineDayExerciseInput } from '../../core/models/routine';
import { RoutineExerciseForm } from './routine-exercise-form';

const pullUps: Exercise = {
  id: 4, name: 'Dominadas', muscle_group: 'lats', secondary_muscles: [], equipment: 'bodyweight',
  is_unilateral: false, uses_bodyweight: true, notes: null, archived_at: null,
};

const walk: Exercise = {
  id: 8, name: 'Caminata inclinada', kind: 'cardio', muscle_group: 'other', secondary_muscles: [], equipment: 'machine',
  is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
};

describe('RoutineExerciseForm', () => {
  it('emits the targets with the chosen exercise', async () => {
    const fixture = TestBed.createComponent(RoutineExerciseForm);
    fixture.componentRef.setInput('exercises', [pullUps]);
    fixture.componentRef.setInput('initial', null);
    fixture.componentRef.setInput('submitLabel', 'Agregar');
    await fixture.whenStable();

    let emitted: RoutineDayExerciseInput | undefined;
    fixture.componentInstance.saved.subscribe((value) => (emitted = value));

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[role=option]')?.click();
    const form = fixture.componentInstance['form'];
    form.patchValue({ target_sets: 6, target_reps_min: 5, target_reps_max: 6, rest_seconds: 150 });
    fixture.componentInstance['submit']();

    expect(emitted).toEqual({
      exercise_id: 4, target_sets: 6, target_reps_min: 5, target_reps_max: 6, target_text: null,
      default_set_type: 'normal', rest_seconds: 150, notes: null,
    });
  });

  it('does not emit when the reps range is inverted', async () => {
    const fixture = TestBed.createComponent(RoutineExerciseForm);
    fixture.componentRef.setInput('exercises', [pullUps]);
    fixture.componentRef.setInput('initial', null);
    fixture.componentRef.setInput('submitLabel', 'Agregar');
    await fixture.whenStable();

    let emitted = false;
    fixture.componentInstance.saved.subscribe(() => (emitted = true));
    fixture.componentInstance['form'].patchValue({ exercise_id: 4, target_reps_min: 10, target_reps_max: 8 });
    fixture.componentInstance['submit']();

    expect(emitted).toBe(false);
    expect(fixture.componentInstance['error']()).toBe('El máximo de reps no puede ser menor que el mínimo.');
  });

  it('plans cardio as segments with a free target', async () => {
    const fixture = TestBed.createComponent(RoutineExerciseForm);
    fixture.componentRef.setInput('exercises', [walk]);
    fixture.componentRef.setInput('initial', null);
    fixture.componentRef.setInput('submitLabel', 'Agregar');
    await fixture.whenStable();
    let emitted: RoutineDayExerciseInput | undefined;
    fixture.componentInstance.saved.subscribe((value) => (emitted = value));

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[role=option]')?.click();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#target_reps_min')).toBeNull();
    expect(el.querySelector('#rest_seconds')).toBeNull();
    expect(el.querySelector('label[for=target_sets]')!.textContent).toContain('Tramos');

    fixture.componentInstance['form'].patchValue({ target_text: '35 min · 12 %' });
    fixture.componentInstance['submit']();

    expect(emitted).toEqual({
      exercise_id: 8, target_sets: 1, target_reps_min: null, target_reps_max: null, target_text: '35 min · 12 %',
      default_set_type: 'normal', rest_seconds: 0, notes: null,
    });
  });
});
