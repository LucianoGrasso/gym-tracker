import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { NgxEchartsDirective } from 'ngx-echarts';
import { StatsApi } from '../../core/api/stats-api';
import { formatDate, formatKg } from '../../core/format/format';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import { PERIOD_LABELS, STATS_PERIODS } from '../../core/models/labels';
import type { ExerciseSessionStats, StatsPeriod } from '../../core/models/stats';
import { lineOption, type LinePoint } from '../../shared/charts/chart-options';
import { ChipGroup } from '../../shared/ui/chip-group';
import { formatBestE1rm, formatHeaviest, formatMostReps } from './format-record';

type MetricKey = 'e1rm_kg' | 'best_load_kg' | 'volume_kg' | 'total_reps';

/** Una métrica por gráfico (nunca dos ejes): se cambia con los chips. */
export const EXERCISE_METRICS: readonly { key: MetricKey; label: string; unit: string }[] = [
  { key: 'e1rm_kg', label: '1RM estimado', unit: 'kg' },
  { key: 'best_load_kg', label: 'Mejor peso', unit: 'kg' },
  { key: 'volume_kg', label: 'Volumen', unit: 'kg' },
  { key: 'total_reps', label: 'Reps totales', unit: 'reps' },
];

/** Mejor serie Bilbo (más reps) de cada sesión que tuvo Bilbo. */
export function bilboPoints(sessions: ExerciseSessionStats[]): LinePoint[] {
  return sessions
    .filter((s) => s.bilbo.length > 0)
    .map((s) => ({ date: s.date, value: Math.max(...s.bilbo.map((b) => b.reps)) }));
}

import { AppSkeleton } from '../../shared/ui/app-skeleton';

@Component({
  selector: 'app-exercise-stats-page',
  imports: [RouterLink, NgIcon, NgxEchartsDirective, ChipGroup, AppSkeleton],
  providers: [provideIcons({ lucideChevronLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-4 flex items-center gap-3">
      <a
        routerLink="/estadisticas"
        class="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card"
        aria-label="Volver a Estadísticas"
      >
        <ng-icon name="lucideChevronLeft" size="22" />
      </a>
      <div class="min-w-0">
        <p class="eyebrow">Estadísticas</p>
        <h1 class="page-title truncate">{{ stats.value()?.exercise?.name ?? '…' }}</h1>
      </div>
    </header>

    <app-chip-group
      class="mb-4 block"
      label="Período"
      [options]="periodOptions"
      [value]="period()"
      (valueChange)="period.set($any($event))"
    />

    @if (stats.value(); as s) {
      <div class="mb-6 grid grid-cols-2 gap-2">
        <div class="card col-span-2 p-4">
          <p class="eyebrow">Mejor 1RM estimado</p>
          <p class="num text-2xl font-bold text-primary">
            {{ s.records.best_e1rm ? formatBestE1rm(s.records.best_e1rm) : '—' }}
          </p>
          @if (s.records.best_e1rm) {
            <p class="text-xs text-muted-foreground">{{ formatDate(s.records.best_e1rm.date) }}</p>
          }
        </div>
        <div class="card p-4">
          <p class="eyebrow">Récord de peso</p>
          <p class="num text-xl font-bold">{{ s.records.heaviest ? formatHeaviest(s.records.heaviest) : '—' }}</p>
          @if (s.records.heaviest) {
            <p class="text-xs text-muted-foreground">{{ formatDate(s.records.heaviest.date) }}</p>
          }
        </div>
        <div class="card p-4">
          <p class="eyebrow">Más reps</p>
          <p class="num text-xl font-bold">{{ s.records.most_reps ? formatMostReps(s.records.most_reps) : '—' }}</p>
          @if (s.records.most_reps) {
            <p class="text-xs text-muted-foreground">{{ formatDate(s.records.most_reps.date) }}</p>
          }
        </div>
      </div>

      <section class="card mb-6 p-4">
        <app-chip-group
          class="mb-3 block"
          label="Métrica"
          [options]="metricOptions"
          [value]="metric()"
          (valueChange)="metric.set($any($event))"
        />
        @if (chart(); as option) {
          <div echarts [options]="option" class="h-60" role="img" [attr.aria-label]="metricLabel() + ' por sesión'"></div>
        } @else {
          <p class="text-sm text-muted-foreground">Sin sesiones en este período.</p>
        }
      </section>

      @if (bilboChart(); as option) {
        <section class="card mb-6 p-4">
          <h2 class="section-title mb-2">Series Bilbo</h2>
          <div echarts [options]="option" class="h-48" role="img" aria-label="Reps de la mejor serie Bilbo por sesión"></div>
        </section>
      }

      @if (s.sessions.length) {
        <section class="mb-6">
          <h2 class="section-title mb-3">Sesiones</h2>
          <div class="card overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="eyebrow">
                <tr>
                  <th class="px-3 py-2 font-medium">Fecha</th>
                  <th class="px-3 py-2 text-right font-medium">1RM est.</th>
                  <th class="px-3 py-2 text-right font-medium">Mejor serie</th>
                  <th class="px-3 py-2 text-right font-medium">Volumen</th>
                  <th class="px-3 py-2 text-right font-medium">Reps</th>
                </tr>
              </thead>
              <tbody class="num text-base">
                @for (row of sessionsNewestFirst(); track row.workout_id) {
                  <tr class="border-t border-border">
                    <td class="px-3 py-2">{{ formatDate(row.date) }}</td>
                    <td class="px-3 py-2 text-right">{{ row.e1rm_kg === null ? '—' : formatKg(row.e1rm_kg) }}</td>
                    <td class="px-3 py-2 text-right">
                      {{ row.best_load_kg === null ? '—' : formatKg(row.best_load_kg) + ' × ' + row.best_load_reps }}
                    </td>
                    <td class="px-3 py-2 text-right">{{ formatKg(row.volume_kg) }}</td>
                    <td class="px-3 py-2 text-right">{{ row.total_reps }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    } @else if (stats.error()) {
      <p class="text-destructive">No se pudieron cargar las estadísticas de este ejercicio.</p>
    } @else {
      <app-skeleton variant="page" />
    }
  `,
})
export class ExerciseStatsPage {
  private readonly api = inject(StatsApi);
  private readonly db = inject(LOCAL_DB);

  readonly id = input.required<string>();

  protected readonly formatKg = formatKg;
  protected readonly formatDate = formatDate;
  protected readonly formatHeaviest = formatHeaviest;
  protected readonly formatBestE1rm = formatBestE1rm;
  protected readonly formatMostReps = formatMostReps;
  protected readonly periodOptions = STATS_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }));
  protected readonly metricOptions = EXERCISE_METRICS.map((m) => ({ value: m.key, label: m.label }));

  protected readonly period = signal<StatsPeriod>('12w');
  protected readonly metric = signal<MetricKey>('e1rm_kg');
  protected readonly metricLabel = computed(() => EXERCISE_METRICS.find((m) => m.key === this.metric())!.label);

  protected readonly stats = resource({
    params: () => ({ id: Number(this.id()), period: this.period() }),
    loader: ({ params }) =>
      cachedFetch(this.db, `stats:exercise:${params.id}:${params.period}`, () =>
        this.api.exercise(params.id, params.period),
      ),
  });

  protected readonly chart = computed(() => {
    const sessions = this.stats.value()?.sessions ?? [];
    const metric = EXERCISE_METRICS.find((m) => m.key === this.metric())!;
    const points = sessions.map((s) => ({ date: s.date, value: s[metric.key] }));
    return points.some((p) => p.value !== null) ? lineOption(points, metric.label, metric.unit) : null;
  });

  protected readonly bilboChart = computed(() => {
    const points = bilboPoints(this.stats.value()?.sessions ?? []);
    return points.length ? lineOption(points, 'Reps Bilbo', 'reps') : null;
  });

  protected readonly sessionsNewestFirst = computed(() => [...(this.stats.value()?.sessions ?? [])].reverse());
}
