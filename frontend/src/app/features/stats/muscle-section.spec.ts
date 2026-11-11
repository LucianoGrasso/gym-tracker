import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { MuscleSetsEntry } from '../../core/models/stats';
import { MuscleSection } from './muscle-section';

const entries: MuscleSetsEntry[] = [
  { muscle: 'chest', sets: 88, sets_per_week: 20, status: 'in_range' },
  { muscle: 'quads', sets: 52, sets_per_week: 11.8, status: 'in_range' },
  { muscle: 'lats', sets: 0, sets_per_week: 0, status: 'none' },
];

async function setup() {
  const fixture = TestBed.createComponent(MuscleSection);
  fixture.componentRef.setInput('entries', entries);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const detail = () => el.querySelector('[data-detail]')!.textContent!.trim();
  return { fixture, el, detail };
}

describe('MuscleSection', () => {
  it('paints the map by weekly sets and names them for screen readers', async () => {
    const { el } = await setup();
    const chest = el.querySelector('[data-muscle="chest"]')!;

    expect(chest.getAttribute('fill')).toBe('#c8f135');
    expect(el.querySelector('[data-muscle="quads"]')!.getAttribute('aria-label')).toBe('Cuádriceps, 11,8 series por semana');
  });

  it('explains how to use the map until a muscle is chosen', async () => {
    const { fixture, el, detail } = await setup();
    expect(detail()).toBe('Toca un músculo para ver sus series por semana.');

    el.querySelector('[data-muscle="quads"]')!.dispatchEvent(new MouseEvent('click'));
    await fixture.whenStable();

    expect(detail()).toBe('Cuádriceps · 11,8 series/sem · en rango (10–20)');
  });

  it('shares the selection between the ranking and the map', async () => {
    const { fixture, el, detail } = await setup();
    const lats = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Dorsales'))!;

    lats.click();
    await fixture.whenStable();

    expect(detail()).toBe('Dorsales · sin series en el período');
    expect(el.querySelector('[data-muscle="lats"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});
