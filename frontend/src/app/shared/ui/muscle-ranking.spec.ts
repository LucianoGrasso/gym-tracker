import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { MuscleSetsEntry } from '../../core/models/stats';
import { MuscleRanking } from './muscle-ranking';

const entries: MuscleSetsEntry[] = [
  { muscle: 'chest', sets: 32, sets_per_week: 8, status: 'low' },
  { muscle: 'lats', sets: 0, sets_per_week: 0, status: 'none' },
  { muscle: 'quads', sets: 50, sets_per_week: 12.5, status: 'in_range' },
  { muscle: 'other', sets: 0, sets_per_week: 0, status: 'none' },
];

async function setup() {
  const fixture = TestBed.createComponent(MuscleRanking);
  fixture.componentRef.setInput('entries', entries);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(el.querySelectorAll<HTMLButtonElement>('button'));
  return { fixture, rows };
}

describe('MuscleRanking', () => {
  it('lists the muscles from most to least weekly sets', async () => {
    const { rows } = await setup();

    expect(rows().map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Cuádriceps 12,5',
      'Pecho 8',
      'Dorsales 0',
    ]);
  });

  it('draws the 10–20 band and each bar on the same scale', async () => {
    const { rows } = await setup();
    const band = rows()[0].querySelector<HTMLElement>('[data-band]')!;
    const bar = rows()[0].querySelector<HTMLElement>('[data-bar]')!;

    // escala de 0 a 25 series/sem
    expect(band.style.left).toBe('40%');
    expect(band.style.width).toBe('40%');
    expect(bar.style.width).toBe('50%');
  });

  it('selects a muscle with a tap and marks its row', async () => {
    const { fixture, rows } = await setup();

    rows()[1].click();
    await fixture.whenStable();

    expect(fixture.componentInstance.selected()).toBe('chest');
    expect(rows()[1].getAttribute('aria-pressed')).toBe('true');
    expect(rows()[0].getAttribute('aria-pressed')).toBe('false');
  });
});
