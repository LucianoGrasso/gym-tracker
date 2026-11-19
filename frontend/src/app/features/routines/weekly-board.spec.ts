import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import type { RoutineDay } from '../../core/models/routine';
import { WeeklyBoard } from './weekly-board';

const day = (id: number, name: string, weekday: number | null, position: number): RoutineDay => ({
  id,
  routine_id: 7,
  name,
  weekday,
  position,
  exercises: [],
});

const days = [day(1, 'Pecho', 1, 0), day(2, 'Piernas', 4, 1), day(3, 'Extra', null, 2)];

type Drop = CdkDragDrop<number | null>;

function dropEvent(from: number | null, to: number | null, id: number, currentIndex = 0): Drop {
  const previousContainer = { data: from };
  const container = from === to ? previousContainer : { data: to };
  return { previousContainer, container, item: { data: id }, previousIndex: 0, currentIndex } as unknown as Drop;
}

async function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(WeeklyBoard);
  fixture.componentRef.setInput('days', days);
  await fixture.whenStable();
  const moved = vi.fn();
  fixture.componentInstance.moved.subscribe(moved);
  return { board: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, moved };
}

describe('WeeklyBoard', () => {
  it('shows the seven weekdays, rest days and the tray', async () => {
    const { el } = await render();
    const rows = el.querySelectorAll('[data-weekday]');
    expect(rows).toHaveLength(7);
    expect(el.textContent).toContain('LUN');
    expect(el.textContent).toContain('DOM');
    expect(el.querySelector('[data-weekday="1"]')?.textContent).toContain('Pecho');
    expect(el.querySelector('[data-weekday="3"]')?.textContent).toContain('Descanso');
    expect(el.querySelector('[data-weekday="4"]')?.textContent).toContain('Piernas');
    expect(el.querySelector('[data-tray]')?.textContent).toContain('Extra');
    expect(el.querySelector('a[href="/rutinas/7/dias/1"]')).not.toBeNull();
  });

  it('swaps two days when dropping on a busy weekday', async () => {
    const { board, moved } = await render();
    board.drop(dropEvent(1, 4, 1));
    const result = moved.mock.calls[0][0] as RoutineDay[];
    expect(result.map((d) => [d.id, d.weekday])).toEqual([[2, 1], [1, 4], [3, null]]);
  });

  it('moves a day to the tray', async () => {
    const { board, moved } = await render();
    board.drop(dropEvent(4, null, 2, 0));
    const result = moved.mock.calls[0][0] as RoutineDay[];
    expect(result.map((d) => [d.id, d.weekday])).toEqual([[1, 1], [2, null], [3, null]]);
  });

  it('ignores a drop in the same weekday', async () => {
    const { board, moved } = await render();
    board.drop(dropEvent(1, 1, 1));
    expect(moved).not.toHaveBeenCalled();
  });
});
