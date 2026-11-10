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
    // Como en el gimnasio: cada disco entra desde su extremo de la barra hacia el centro.
    expect(el.querySelectorAll('svg .boot-left')).toHaveLength(2);
    expect(el.querySelectorAll('svg .boot-right')).toHaveLength(2);
    // Igual al ícono de la app: la mancuerna dentro de la baldosa redondeada.
    expect(el.querySelector('.boot-tile svg')).not.toBeNull();
    expect(el.textContent).toContain('GymTracker');
    expect(el.querySelector('.skeleton-hint')?.textContent).toContain('Despertando el servidor…');
  });
});
