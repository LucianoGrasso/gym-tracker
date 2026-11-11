import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { MuscleGroup } from '../../../core/models/exercise';
import { MUSCLE_GROUPS } from '../../../core/models/labels';
import { BodyMap } from './body-map';

async function setup(intensities: Partial<Record<MuscleGroup, number>> = {}) {
  const fixture = TestBed.createComponent(BodyMap);
  fixture.componentRef.setInput('intensities', intensities);
  fixture.componentRef.setInput('labels', { quads: 'Cuádriceps, 11,8 series por semana' });
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const muscle = (m: MuscleGroup) =>
    Array.from(el.querySelectorAll<SVGGElement>(`[data-muscle="${m}"]`));
  return { fixture, el, muscle };
}

describe('BodyMap', () => {
  it('draws every muscle but "other", front and back side by side', async () => {
    const { el, muscle } = await setup();

    for (const m of MUSCLE_GROUPS.filter((g) => g !== 'other')) {
      expect(muscle(m).length, m).toBeGreaterThan(0);
    }
    expect(muscle('other')).toHaveLength(0);
    expect(muscle('shoulders')).toHaveLength(2);
    expect(el.textContent).toContain('Frente');
    expect(el.textContent).toContain('Espalda');
  });

  it('paints each muscle by its intensity', async () => {
    const { muscle } = await setup({ chest: 1, quads: 0 });

    expect(muscle('chest')[0].getAttribute('fill')).toBe('#c8f135');
    expect(muscle('quads')[0].getAttribute('fill')).toBe('#2a2d25');
    expect(muscle('lats')[0].getAttribute('fill')).toBe('#2a2d25');
  });

  it('selects a muscle with a tap or the keyboard, and marks it', async () => {
    const { fixture, muscle } = await setup();

    muscle('quads')[0].dispatchEvent(new MouseEvent('click'));
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('quads');
    expect(muscle('quads')[0].getAttribute('aria-pressed')).toBe('true');

    muscle('glutes')[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('glutes');
  });

  it('names every muscle for screen readers', async () => {
    const { muscle } = await setup();

    expect(muscle('quads')[0].getAttribute('aria-label')).toBe(
      'Cuádriceps, 11,8 series por semana',
    );
    expect(muscle('chest')[0].getAttribute('aria-label')).toBe('Pecho');
    expect(muscle('chest')[0].getAttribute('role')).toBe('button');
  });
});
