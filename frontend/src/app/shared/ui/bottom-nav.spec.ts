import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { BottomNav } from './bottom-nav';

describe('BottomNav', () => {
  it('renders the four main sections in order', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BottomNav);
    await fixture.whenStable();

    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('a'));
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Hoy', 'Rutinas', 'Ejercicios', 'Estadísticas']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/hoy', '/rutinas', '/ejercicios', '/estadisticas']);
  });
});
