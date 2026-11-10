import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BootSplash } from './boot-splash';

describe('BootSplash', () => {
  it('shows the logo with plates loading, the name and a late hint', async () => {
    const fixture = TestBed.createComponent(BootSplash);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const status = el.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelectorAll('svg .boot-plate-inner')).toHaveLength(2);
    expect(el.querySelectorAll('svg .boot-plate-outer')).toHaveLength(2);
    expect(el.textContent).toContain('GymTracker');
    expect(el.querySelector('.skeleton-hint')?.textContent).toContain('Despertando el servidor…');
  });
});
