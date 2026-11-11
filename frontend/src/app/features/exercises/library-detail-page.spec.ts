import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseLibraryApi } from '../../core/api/exercise-library-api';
import { LOCAL_DB, LocalDb } from '../../core/local-db/local-db';
import type { LibraryExercise } from '../../core/models/library';
import { LibraryDetailPage } from './library-detail-page';

const bench: LibraryExercise = {
  slug: 'press-de-banca', name: 'Press de banca', muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'],
  equipment: 'barbell', is_unilateral: false, uses_bodyweight: false, owned_exercise_id: null,
};

async function setup(exercise: LibraryExercise) {
  const api = { list: vi.fn().mockResolvedValue([exercise]), adopt: vi.fn().mockResolvedValue({ id: 7 }) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOCAL_DB, useValue: new LocalDb(`test-${crypto.randomUUID()}`) },
      { provide: ExerciseLibraryApi, useValue: api },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(LibraryDetailPage);
  fixture.componentRef.setInput('slug', exercise.slug);
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, api, navigate };
}

describe('LibraryDetailPage', () => {
  it('shows the muscles worked on the body map', async () => {
    const { el } = await setup(bench);

    expect(el.querySelector('h1')!.textContent).toContain('Press de banca');
    expect(el.textContent).toContain('Principal: Pecho · Secundarios: Tríceps, Hombros');
    expect(el.querySelector('[data-muscle="chest"]')!.getAttribute('fill')).toBe('#c8f135');
  });

  it('adds the exercise to the user and opens it', async () => {
    const { fixture, el, api, navigate } = await setup(bench);

    Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes('Agregar a mis ejercicios'))!.click();
    await fixture.whenStable();

    expect(api.adopt).toHaveBeenCalledWith('press-de-banca');
    expect(navigate).toHaveBeenCalledWith(['/ejercicios', 7]);
  });

  it('links to the own exercise when it is already in use', async () => {
    const { el } = await setup({ ...bench, owned_exercise_id: 3 });

    expect(el.querySelector('a[href="/ejercicios/3"]')!.textContent).toContain('Ver mi ejercicio');
  });
});
