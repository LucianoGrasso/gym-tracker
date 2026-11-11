import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ExercisesApi } from '../../core/api/exercises-api';
import type { Exercise } from '../../core/models/exercise';
import { ConfirmService } from '../../shared/ui/confirm-dialog';
import { ExerciseDetailPage } from './exercise-detail-page';

const bench: Exercise = {
  id: 4, name: 'Press de banca', muscle_group: 'chest', secondary_muscles: [], equipment: 'barbell',
  is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null, has_history: true,
};

async function setup(exercise: Exercise) {
  const api = {
    get: vi.fn().mockResolvedValue(exercise),
    history: vi.fn().mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1 } }),
    archive: vi.fn().mockResolvedValue({ ...exercise, archived_at: '2026-11-11T00:00:00Z' }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const confirm = { ask: vi.fn().mockResolvedValue(true) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ExercisesApi, useValue: api },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ExerciseDetailPage);
  fixture.componentRef.setInput('id', String(exercise.id));
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes(text));
  return { fixture, el, api, navigate, button, confirm };
}

describe('ExerciseDetailPage', () => {
  it('offers a single "Quitar" action instead of archive and delete', async () => {
    const { button } = await setup(bench);

    expect(button('Quitar de mis ejercicios')).toBeDefined();
    expect(button('Archivar')).toBeUndefined();
    expect(button('Eliminar')).toBeUndefined();
  });

  it('hides an exercise with history, keeping its history', async () => {
    const { fixture, api, navigate, button, confirm } = await setup(bench);

    button('Quitar de mis ejercicios')!.click();
    await fixture.whenStable();

    expect(confirm.ask).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Quitar', destructive: true }));
    expect(api.archive).toHaveBeenCalledWith(4);
    expect(api.remove).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/ejercicios');
  });

  it('deletes an exercise without history', async () => {
    const { fixture, api, button } = await setup({ ...bench, has_history: false });

    button('Quitar de mis ejercicios')!.click();
    await fixture.whenStable();

    expect(api.remove).toHaveBeenCalledWith(4);
    expect(api.archive).not.toHaveBeenCalled();
  });
});
