import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseLibraryApi } from '../../core/api/exercise-library-api';
import { ExercisesApi } from '../../core/api/exercises-api';
import { LOCAL_DB, LocalDb } from '../../core/local-db/local-db';
import { ExercisesPage } from './exercises-page';

async function render(vista?: string) {
  const exercises = {
    list: vi.fn().mockResolvedValue([
      {
        id: 1, name: 'Press de banca', muscle_group: 'chest', secondary_muscles: ['triceps'], equipment: 'barbell',
        is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
      },
    ]),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOCAL_DB, useValue: new LocalDb(`test-${crypto.randomUUID()}`) },
      { provide: ExercisesApi, useValue: exercises },
      { provide: ExerciseLibraryApi, useValue: { list: vi.fn().mockResolvedValue([]) } },
    ],
  });
  const fixture = TestBed.createComponent(ExercisesPage);
  if (vista) fixture.componentRef.setInput('vista', vista);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, exercises };
}

describe('ExercisesPage', () => {
  it('shows my exercises by default', async () => {
    const { el, exercises } = await render();

    expect(el.querySelector('[aria-current="page"]')!.textContent).toContain('Mis ejercicios');
    expect(el.querySelector('app-library-list')).toBeNull();
    expect(exercises.list).toHaveBeenCalled();
  });

  it('shows my exercises like the library rows, without archived ones', async () => {
    const { fixture, el, exercises } = await render();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();

    expect(exercises.list).toHaveBeenCalledWith({});
    expect(el.querySelector('app-mini-body-map')).not.toBeNull();
    expect(el.textContent).toContain('Pecho · Barra');
    expect(el.textContent).not.toContain('Ver archivados');
  });

  it('shows the library tab from the URL, without loading my list', async () => {
    const { el, exercises } = await render('biblioteca');

    expect(el.querySelector('[aria-current="page"]')!.textContent).toContain('Biblioteca');
    expect(el.querySelector('app-library-list')).not.toBeNull();
    expect(exercises.list).not.toHaveBeenCalled();
    expect(el.querySelector('a[href="/ejercicios?vista=biblioteca"]')).not.toBeNull();
  });
});
