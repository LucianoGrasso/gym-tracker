import { describe, expect, it } from 'vitest';
import { type ScheduleDay, boardOrder, moveDay, toAssignments } from './schedule';

// 1 lun, 2 mié, 3 jue; 4 y 5 sin día fijo (en ese orden).
const days: ScheduleDay[] = [
  { id: 1, weekday: 1, position: 0 },
  { id: 2, weekday: 3, position: 1 },
  { id: 3, weekday: 4, position: 2 },
  { id: 4, weekday: null, position: 3 },
  { id: 5, weekday: null, position: 4 },
];

const plan = (result: ScheduleDay[]) => result.map((d) => [d.id, d.weekday, d.position]);

describe('boardOrder', () => {
  it('sorts by weekday and then the tray by position', () => {
    const result = boardOrder([
      { id: 9, weekday: 5, position: 0 },
      { id: 8, weekday: null, position: 1 },
      { id: 7, weekday: 2, position: 2 },
      { id: 6, weekday: null, position: 0 },
    ]);
    expect(result.map((d) => d.id)).toEqual([7, 9, 6, 8]);
  });
});

describe('moveDay', () => {
  it('swaps two days', () => {
    expect(plan(moveDay(days, 2, 4))).toEqual([
      [1, 1, 0], [3, 3, 1], [2, 4, 2], [4, null, 3], [5, null, 4],
    ]);
  });

  it('moves a day to a rest day', () => {
    expect(plan(moveDay(days, 1, 7))).toEqual([
      [2, 3, 0], [3, 4, 1], [1, 7, 2], [4, null, 3], [5, null, 4],
    ]);
  });

  it('drops a day into the tray at the given index', () => {
    expect(plan(moveDay(days, 2, null, 1))).toEqual([
      [1, 1, 0], [3, 4, 1], [4, null, 2], [2, null, 3], [5, null, 4],
    ]);
  });

  it('sends the displaced day to the tray slot the dragged one left', () => {
    expect(plan(moveDay(days, 5, 3))).toEqual([
      [1, 1, 0], [5, 3, 1], [3, 4, 2], [4, null, 3], [2, null, 4],
    ]);
  });

  it('reorders the tray', () => {
    expect(plan(moveDay(days, 5, null, 0))).toEqual([
      [1, 1, 0], [2, 3, 1], [3, 4, 2], [5, null, 3], [4, null, 4],
    ]);
  });

  it('keeps the other fields of each day', () => {
    const [moved] = moveDay([{ id: 1, weekday: 1, position: 0, name: 'Pecho' }], 1, 2);
    expect(moved).toEqual({ id: 1, weekday: 2, position: 0, name: 'Pecho' });
  });
});

describe('toAssignments', () => {
  it('keeps only id and weekday, in order', () => {
    expect(toAssignments(days.slice(0, 2))).toEqual([
      { id: 1, weekday: 1 },
      { id: 2, weekday: 3 },
    ]);
  });
});
