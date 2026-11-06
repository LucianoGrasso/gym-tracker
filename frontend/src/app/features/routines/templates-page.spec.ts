import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { RoutineTemplatesApi } from '../../core/api/routine-templates-api';
import type { RoutineTemplate } from '../../core/models/routine-template';
import { TemplatesPage } from './templates-page';

const nippard: RoutineTemplate = {
  slug: 'nippard-ppl', name: 'PPL estilo Jeff Nippard', inspired_by: 'Jeff Nippard',
  description: 'Push/pull/legs de 6 días.', days_per_week: 6, level: 'intermediate', goal: 'hypertrophy', days: [],
};

async function render(list: () => Promise<RoutineTemplate[]>) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: RoutineTemplatesApi, useValue: { list } }],
  });
  const fixture = TestBed.createComponent(TemplatesPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('TemplatesPage', () => {
  it('shows each template with translated tags and who inspired it', async () => {
    const el = await render(() => Promise.resolve([nippard]));

    expect(el.textContent).toContain('PPL estilo Jeff Nippard');
    expect(el.textContent).toContain('Inspirada en Jeff Nippard');
    expect(el.textContent).toContain('6 días');
    expect(el.textContent).toContain('Intermedio');
    expect(el.textContent).toContain('Hipertrofia');
    expect(el.querySelector('a[href="/rutinas/plantillas/nippard-ppl"]')).not.toBeNull();
  });

  it('offers a retry when the catalog fails to load', async () => {
    const el = await render(() => Promise.reject(new Error('offline')));

    expect(el.textContent).toContain('No se pudo cargar el catálogo. Revisa tu conexión.');
    expect(el.querySelector('button')?.textContent).toContain('Reintentar');
  });
});
