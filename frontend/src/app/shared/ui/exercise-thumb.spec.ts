import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ExerciseThumb } from './exercise-thumb';

describe('ExerciseThumb', () => {
  it('draws the body map for strength and a heart for cardio', async () => {
    const fixture = TestBed.createComponent(ExerciseThumb);
    fixture.componentRef.setInput('exercise', { muscle_group: 'chest', secondary_muscles: [] });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-mini-body-map')).not.toBeNull();

    fixture.componentRef.setInput('exercise', { kind: 'cardio', muscle_group: 'other', secondary_muscles: [] });
    await fixture.whenStable();
    expect(el.querySelector('app-mini-body-map')).toBeNull();
    expect(el.querySelector('[data-cardio]')).not.toBeNull();
  });
});
