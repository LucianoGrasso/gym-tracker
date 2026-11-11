import type { EChartsCoreOption } from 'echarts/core';
import { addDays, formatDate, formatShortDate } from '../../core/format/format';
import { MUSCLE_GROUP_LABELS } from '../../core/models/labels';
import type { Consistency } from '../../core/models/stats';
import { CHART, CONSISTENCY_COLORS } from './chart-theme';

const numberFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

export function formatChartNumber(value: number): string {
  return numberFormatter.format(value);
}

const axisLabel = { color: CHART.axis, fontFamily: CHART.numberFont, fontSize: 13 };
const axisBase = {
  axisLine: { lineStyle: { color: CHART.grid } },
  axisTick: { show: false },
  axisLabel,
  splitLine: { lineStyle: { color: CHART.grid } },
};
const tooltipBase = {
  backgroundColor: CHART.surface,
  borderColor: CHART.grid,
  textStyle: { color: CHART.ink, fontFamily: CHART.font },
};

export interface LinePoint {
  date: string;
  value: number | null;
}

/** Una serie en el tiempo (un solo eje): línea lima de 2 px, puntos con anillo y el último valor rotulado. */
export function lineOption(points: LinePoint[], name: string, unit: string): EChartsCoreOption {
  const data = points.filter((p) => p.value !== null).map((p) => [p.date, p.value as number]);

  return {
    animationDuration: 300,
    grid: { left: 8, right: 56, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: CHART.axis } },
      formatter: (params: unknown) => {
        const [point] = params as { value: [string, number] }[];
        return `${formatDate(point.value[0])}<br><b>${formatChartNumber(point.value[1])} ${unit}</b>`;
      },
    },
    xAxis: { type: 'time', ...axisBase, splitLine: { show: false }, axisLabel: { ...axisLabel, formatter: '{dd}/{MM}' } },
    yAxis: { type: 'value', scale: true, ...axisBase, axisLabel: { ...axisLabel, formatter: formatChartNumber } },
    series: [
      {
        name,
        type: 'line',
        data,
        showSymbol: data.length <= 30,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 2, color: CHART.accent },
        itemStyle: { color: CHART.accent, borderColor: CHART.surface, borderWidth: 2 },
        endLabel: {
          show: data.length > 0,
          color: CHART.ink,
          fontFamily: CHART.numberFont,
          fontSize: 15,
          formatter: (p: { value: [string, number] }) => formatChartNumber(p.value[1]),
        },
      },
    ],
  };
}

/** Rango del calendario: las últimas `maxWeeks` semanas del período (caben en un teléfono). */
export function heatmapRange(weeks: { week_start: string }[], maxWeeks = 16): [string, string] {
  const first = weeks.at(-maxWeeks) ?? weeks[0];
  const last = weeks.at(-1)!;
  return [first.week_start, addDays(last.week_start, 6)];
}

/** Calendario de constancia: una celda por día, más brillante con más sesiones. */
export function consistencyOption(days: Consistency['days'], range: [string, string]): EChartsCoreOption {
  return {
    animationDuration: 300,
    tooltip: {
      ...tooltipBase,
      formatter: (params: unknown) => {
        const [date, sessions] = (params as { value: [string, number] }).value;
        return `${formatDate(date)}<br><b>${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'}</b>`;
      },
    },
    visualMap: {
      show: false,
      type: 'piecewise',
      pieces: [
        { value: 1, color: CONSISTENCY_COLORS[1] },
        { min: 2, color: CONSISTENCY_COLORS[2] },
      ],
    },
    calendar: {
      range,
      top: 24,
      left: 24,
      right: 4,
      bottom: 4,
      cellSize: ['auto', 18],
      splitLine: { show: false },
      itemStyle: { color: CONSISTENCY_COLORS[0], borderColor: CHART.surface, borderWidth: 3 },
      dayLabel: {
        firstDay: 1,
        nameMap: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
        color: CHART.axis,
        fontFamily: CHART.font,
      },
      monthLabel: {
        nameMap: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
        color: CHART.axis,
        fontFamily: CHART.font,
      },
      yearLabel: { show: false },
    },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: days.map((d) => [d.date, d.sessions]) }],
  };
}
