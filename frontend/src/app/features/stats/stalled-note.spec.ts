import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import type { StalledExercise } from '../../core/models/stats';
import { STALLED_ALTERNATIVES, StalledSection, stalledLines } from './stalled-note';

const bench: StalledExercise = {
  exercise_id: 7, name: 'Press de banca', best_e1rm_kg: 116.67, best_date: '2026-10-02', sessions_since: 4, deload_kg: 72.5,
};
const pullUps: StalledExercise = { ...bench, exercise_id: 8, name: 'Dominadas', deload_kg: null };

async function renderSection(items: StalledExercise[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(StalledSection);
  fixture.componentRef.setInput('items', items);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('stalledLines', () => {
  it('describes the plateau and a concrete deload', () => {
    expect(stalledLines(bench)).toEqual({
      since: 'Sin récord desde 02/10/2026 · 4 sesiones',
      deload: 'Descarga: una semana con 72,5 kg',
    });
  });

  it('suggests a deload without a weight for bodyweight exercises', () => {
    expect(stalledLines(pullUps).deload).toBe('Descarga: una semana sin lastre o con 2 reps menos por serie');
  });
});

describe('StalledSection', () => {
  it('lists each stalled exercise linking to its stats, with the alternatives once', async () => {
    const el = await renderSection([bench, pullUps]);

    expect(el.querySelector('h2')!.textContent).toContain('Estancados');
    const links = Array.from(el.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/estadisticas/ejercicios/7', '/estadisticas/ejercicios/8']);
    expect(links[0].textContent).toContain('Press de banca');
    expect(links[0].textContent).toContain('Descarga: una semana con 72,5 kg');
    expect(el.textContent!.split(STALLED_ALTERNATIVES)).toHaveLength(2);
  });

  it('renders nothing without stalled exercises', async () => {
    const el = await renderSection([]);
    expect(el.textContent!.trim()).toBe('');
  });
});
