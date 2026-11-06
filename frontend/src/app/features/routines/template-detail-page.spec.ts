import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { RoutineTemplatesApi } from '../../core/api/routine-templates-api';
import type { RoutineTemplate } from '../../core/models/routine-template';
import { TemplateDetailPage } from './template-detail-page';

const phul: RoutineTemplate = {
  slug: 'phul', name: 'PHUL', inspired_by: null, description: 'Fuerza e hipertrofia.',
  days_per_week: 1, level: 'intermediate', goal: 'mixed',
  days: [{
    name: 'Lunes – Superior potencia', weekday: 1,
    exercises: [{
      name: 'Press de banca', muscle_group: 'chest', target_sets: 4, target_reps_min: 3, target_reps_max: 5,
      default_set_type: 'heavy', rest_seconds: 180, target_text: '3-4 series',
    }],
  }],
};

@Component({ template: '' })
class Blank {}

async function render(importFn: (slug: string) => Promise<unknown>) {
  const api = { find: vi.fn().mockResolvedValue(phul), import: vi.fn(importFn) };
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'rutinas/:id', component: Blank }]), { provide: RoutineTemplatesApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(TemplateDetailPage);
  fixture.componentRef.setInput('slug', 'phul');
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Agregar a mis rutinas'))!;
  return { fixture, api, el, button };
}

describe('TemplateDetailPage', () => {
  it('shows every day with its exercises and targets', async () => {
    const { el } = await render(() => Promise.resolve({ id: 42 }));

    expect(el.textContent).toContain('Lunes – Superior potencia');
    expect(el.textContent).toContain('Press de banca');
    expect(el.textContent).toContain('4 × 3-5');
    expect(el.textContent).toContain('Pesada');
    expect(el.textContent).toContain('3-4 series');
  });

  it('imports the template and opens the new routine', async () => {
    const { fixture, api, button } = await render(() => Promise.resolve({ id: 42 }));

    button().click();
    await fixture.whenStable();

    expect(api.import).toHaveBeenCalledWith('phul');
    expect(TestBed.inject(Router).url).toBe('/rutinas/42?agregada=1');
  });

  it('shows an error and re-enables the button when the import fails', async () => {
    const { fixture, el, button } = await render(() => Promise.reject(new Error('offline')));

    button().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('No se pudo agregar la plantilla. Revisa tu conexión e inténtalo de nuevo.');
    expect(button().disabled).toBe(false);
  });
});
