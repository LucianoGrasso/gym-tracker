import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { MuscleGroup } from '../../../core/models/exercise';
import { MiniBodyMap } from './mini-body-map';

async function render(primary: MuscleGroup, secondaries: MuscleGroup[] = []) {
  const fixture = TestBed.createComponent(MiniBodyMap);
  fixture.componentRef.setInput('primary', primary);
  fixture.componentRef.setInput('secondaries', secondaries);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    el,
    fill: (m: MuscleGroup) =>
      el.querySelector(`[data-muscle="${m}"]`)?.getAttribute('fill') ?? null,
  };
}

describe('MiniBodyMap', () => {
  it('shows the front for front muscles and the back for back muscles', async () => {
    expect((await render('chest')).el.querySelector('[data-view]')!.getAttribute('data-view')).toBe(
      'front',
    );
    expect((await render('lats')).el.querySelector('[data-view]')!.getAttribute('data-view')).toBe(
      'back',
    );
    expect(
      (await render('shoulders')).el.querySelector('[data-view]')!.getAttribute('data-view'),
    ).toBe('front');
  });

  it('paints the primary muscle strong and the secondary ones soft', async () => {
    const { fill } = await render('chest', ['triceps', 'shoulders']);

    expect(fill('chest')).toBe('#c8f135');
    expect(fill('shoulders')).not.toBe('#2a2d25');
    expect(fill('shoulders')).not.toBe('#c8f135');
    expect(fill('quads')).toBe('#2a2d25');
  });

  it('is decorative for screen readers', async () => {
    expect((await render('chest')).el.querySelector('svg')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});
