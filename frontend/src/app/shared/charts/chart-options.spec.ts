import { describe, expect, it } from 'vitest';
import { CHART } from './chart-theme';
import { consistencyOption, heatmapRange, lineOption } from './chart-options';

// Las opciones de ECharts son objetos anidados sin tipos estrictos por serie.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOption = any;

describe('lineOption', () => {
  it('plots dated values in lime on one axis, skipping sessions without a value', () => {
    const option = lineOption(
      [
        { date: '2026-10-01', value: 100 },
        { date: '2026-10-08', value: null },
        { date: '2026-10-15', value: 105 },
      ],
      '1RM estimado',
      'kg',
    ) as AnyOption;

    expect(option.series).toHaveLength(1);
    expect(option.series[0].name).toBe('1RM estimado');
    expect(option.series[0].data).toEqual([
      ['2026-10-01', 100],
      ['2026-10-15', 105],
    ]);
    expect(option.series[0].lineStyle.color).toBe(CHART.accent);
    expect(Array.isArray(option.yAxis)).toBe(false);
  });
});

describe('heatmapRange', () => {
  it('covers at most the last weeks, ending on sunday', () => {
    const weeks = Array.from({ length: 20 }, (_, i) => ({
      week_start: new Date(Date.UTC(2026, 5, 15 + i * 7)).toISOString().slice(0, 10),
    }));

    expect(heatmapRange(weeks, 16)).toEqual(['2026-07-13', '2026-11-01']);
    expect(heatmapRange([{ week_start: '2026-11-02' }], 16)).toEqual(['2026-11-02', '2026-11-08']);
  });
});

describe('consistencyOption', () => {
  it('maps the days to a monday-first calendar heatmap', () => {
    const option = consistencyOption([{ date: '2026-11-03', sessions: 2 }], ['2026-10-26', '2026-11-08']) as AnyOption;

    expect(option.calendar.range).toEqual(['2026-10-26', '2026-11-08']);
    expect(option.calendar.dayLabel.firstDay).toBe(1);
    expect(option.series[0].data).toEqual([['2026-11-03', 2]]);
  });
});
