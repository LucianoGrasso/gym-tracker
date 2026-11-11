import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseLibraryApi } from '../../core/api/exercise-library-api';
import { ExercisesApi } from '../../core/api/exercises-api';
import { LOCAL_DB, LocalDb } from '../../core/local-db/local-db';
import { ExercisesPage } from './exercises-page';

async function render(vista?: string) {
  const exercises = { list: vi.fn().mockResolvedValue([]) };
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
  return { el: fixture.nativeElement as HTMLElement, exercises };
}

describe('ExercisesPage', () => {
  it('shows my exercises by default', async () => {
    const { el, exercises } = await render();

    expect(el.querySelector('[aria-current="page"]')!.textContent).toContain('Mis ejercicios');
    expect(el.querySelector('app-library-list')).toBeNull();
    expect(exercises.list).toHaveBeenCalled();
  });

  it('shows the library tab from the URL, without loading my list', async () => {
    const { el, exercises } = await render('biblioteca');

    expect(el.querySelector('[aria-current="page"]')!.textContent).toContain('Biblioteca');
    expect(el.querySelector('app-library-list')).not.toBeNull();
    expect(exercises.list).not.toHaveBeenCalled();
    expect(el.querySelector('a[href="/ejercicios?vista=biblioteca"]')).not.toBeNull();
  });
});
