import { TestBed } from '@angular/core/testing';
import { provideEchartsCore } from 'ngx-echarts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CardioExerciseStats, CardioSessionStats } from '../../core/models/stats';
import { CardioStats, availableCardioMetrics, formatCardioSummary } from './cardio-stats';

const session = (date: string, extra: Partial<CardioSessionStats> = {}): CardioSessionStats => ({
  workout_id: date, date, minutes: 35, distance_km: null, calories: null,
  avg_speed_kmh: null, avg_incline_pct: 12, avg_heart_rate: null, ...extra,
});

describe('cardio stats helpers', () => {
  it('offers only the metrics with data', () => {
    expect(availableCardioMetrics([session('2026-11-04'), session('2026-11-11', { distance_km: 3.2 })]).map((m) => m.label))
      .toEqual(['Duración', 'Distancia', 'Inclinación prom.']);
  });

  it('summarizes the period', () => {
    expect(formatCardioSummary({ minutes: 140, sessions: 4, distance_km: 12.3 })).toBe('140 min · 4 sesiones · 12,3 km');
    expect(formatCardioSummary({ minutes: 35, sessions: 1, distance_km: 0 })).toBe('35 min · 1 sesión');
  });
});

describe('CardioStats', () => {
  // El gráfico no se dibuja en las pruebas: echarts nunca termina de cargar y jsdom no trae ResizeObserver.
  beforeEach(() => {
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    TestBed.configureTestingModule({ providers: [provideEchartsCore({ echarts: () => new Promise(() => {}) })] });
  });

  it('shows the metric chips and the sessions newest first', async () => {
    const stats: CardioExerciseStats = {
      period: '1m', exercise: { id: 7, name: 'Caminata', kind: 'cardio' },
      sessions: [session('2026-11-04', { minutes: 30 }), session('2026-11-11', { minutes: 35.5, distance_km: 3.2 })],
    };
    const fixture = TestBed.createComponent(CardioStats);
    fixture.componentRef.setInput('stats', stats);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const chips = Array.from(el.querySelectorAll('app-chip-group button')).map((b) => b.textContent!.trim());
    expect(chips).toEqual(['Duración', 'Distancia', 'Inclinación prom.']);
    const rows = Array.from(el.querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('11/11/2026');
    expect(rows[0]).toContain('35,5');
    expect(rows[0]).toContain('3,2');
  });

  it('says when there are no sessions', async () => {
    const fixture = TestBed.createComponent(CardioStats);
    fixture.componentRef.setInput('stats', { period: '1m', exercise: { id: 7, name: 'Caminata', kind: 'cardio' }, sessions: [] });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin sesiones en este período.');
  });
});
