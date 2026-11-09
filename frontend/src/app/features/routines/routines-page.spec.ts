import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { RoutinesApi } from '../../core/api/routines-api';
import type { Routine } from '../../core/models/routine';
import { RoutinesPage } from './routines-page';

const routines: Routine[] = [
  { id: 1, name: 'Rutina 4 días', notes: null, is_active: true, days_count: 4 },
  { id: 2, name: 'PHUL', notes: null, is_active: false, days_count: 4 },
];

async function render(activate: () => Promise<unknown> = () => Promise.resolve(routines[1])) {
  const api = { list: vi.fn().mockResolvedValue(routines), activate: vi.fn(activate) };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: RoutinesApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(RoutinesPage);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const card = (name: string) =>
    [...el.querySelectorAll('li')].find((li) => li.textContent?.includes(name))!;
  return { api, el, settle, card };
}

describe('RoutinesPage', () => {
  it('activates a routine in place, with the activation animation', async () => {
    const { api, settle, card } = await render();

    card('PHUL').querySelector('button')!.click();
    await settle();

    expect(api.activate).toHaveBeenCalledWith(2);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(card('PHUL').classList).toContain('routine-activated');
    expect(card('PHUL').textContent).toContain('Activa');
    expect(card('PHUL').querySelector('button')).toBeNull();
    expect(card('Rutina 4 días').textContent).not.toContain('Activa');
    expect(card('Rutina 4 días').querySelector('button')?.textContent).toContain(
      'Marcar como activa',
    );
  });

  it('keeps the list as it was when activation fails', async () => {
    const { el, settle, card } = await render(() => Promise.reject(new Error('offline')));

    card('PHUL').querySelector('button')!.click();
    await settle();

    expect(card('Rutina 4 días').textContent).toContain('Activa');
    expect(card('PHUL').classList).not.toContain('routine-activated');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });
});
