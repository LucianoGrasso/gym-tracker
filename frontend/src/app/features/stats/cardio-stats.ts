import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { formatDate } from '../../core/format/format';
import type { CardioExerciseStats, CardioSessionStats, CardioSummary } from '../../core/models/stats';
import { formatNumber } from '../../core/workout/set-suggestions';
import { lineOption } from '../../shared/charts/chart-options';
import { ChipGroup } from '../../shared/ui/chip-group';

type CardioMetricKey = 'minutes' | 'distance_km' | 'avg_incline_pct' | 'avg_speed_kmh' | 'avg_heart_rate';

/** Una métrica por gráfico (nunca dos ejes): se cambia con los chips. */
export const CARDIO_METRICS: readonly { key: CardioMetricKey; label: string; unit: string }[] = [
  { key: 'minutes', label: 'Duración', unit: 'min' },
  { key: 'distance_km', label: 'Distancia', unit: 'km' },
  { key: 'avg_incline_pct', label: 'Inclinación prom.', unit: '%' },
  { key: 'avg_speed_kmh', label: 'Velocidad prom.', unit: 'km/h' },
  { key: 'avg_heart_rate', label: 'FC prom.', unit: 'lpm' },
];

export function availableCardioMetrics(sessions: CardioSessionStats[]) {
  return CARDIO_METRICS.filter((m) => sessions.some((s) => s[m.key] !== null));
}

/** "140 min · 4 sesiones · 12,3 km" (km solo si hubo distancia). */
export function formatCardioSummary(summary: CardioSummary): string {
  const parts = [`${summary.minutes} min`, `${summary.sessions} ${summary.sessions === 1 ? 'sesión' : 'sesiones'}`];
  if (summary.distance_km > 0) parts.push(`${formatNumber(summary.distance_km)} km`);
  return parts.join(' · ');
}

@Component({
  selector: 'app-cardio-stats',
  imports: [NgxEchartsDirective, ChipGroup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stats().sessions.length) {
      <section class="card mb-6 p-4">
        <app-chip-group
          class="mb-3 block"
          label="Métrica"
          [options]="metricOptions()"
          [value]="metric()"
          (valueChange)="metric.set($any($event))"
        />
        @if (chart(); as option) {
          <div echarts [options]="option" class="h-60" role="img" [attr.aria-label]="metricLabel() + ' por sesión'"></div>
        }
      </section>

      <section class="mb-6">
        <h2 class="section-title mb-3">Sesiones</h2>
        <div class="card overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="eyebrow">
              <tr>
                <th class="px-3 py-2 font-medium">Fecha</th>
                <th class="px-3 py-2 text-right font-medium">Min</th>
                <th class="px-3 py-2 text-right font-medium">km</th>
                <th class="px-3 py-2 text-right font-medium">Incl. %</th>
                <th class="px-3 py-2 text-right font-medium">FC</th>
              </tr>
            </thead>
            <tbody class="num text-base">
              @for (row of newestFirst(); track row.workout_id) {
                <tr class="border-t border-border">
                  <td class="px-3 py-2">{{ formatDate(row.date) }}</td>
                  <td class="px-3 py-2 text-right">{{ show(row.minutes) }}</td>
                  <td class="px-3 py-2 text-right">{{ show(row.distance_km) }}</td>
                  <td class="px-3 py-2 text-right">{{ show(row.avg_incline_pct) }}</td>
                  <td class="px-3 py-2 text-right">{{ show(row.avg_heart_rate) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else {
      <p class="card mb-6 p-4 text-sm text-muted-foreground">Sin sesiones en este período.</p>
    }
  `,
})
export class CardioStats {
  readonly stats = input.required<CardioExerciseStats>();

  protected readonly formatDate = formatDate;
  protected readonly available = computed(() => availableCardioMetrics(this.stats().sessions));
  protected readonly metricOptions = computed(() => this.available().map((m) => ({ value: m.key, label: m.label })));
  protected readonly metric = linkedSignal<CardioMetricKey>(() => this.available()[0]?.key ?? 'minutes');
  private readonly selected = computed(() => CARDIO_METRICS.find((m) => m.key === this.metric())!);
  protected readonly metricLabel = computed(() => this.selected().label);
  protected readonly chart = computed(() => {
    const metric = this.selected();
    const points = this.stats().sessions.map((s) => ({ date: s.date, value: s[metric.key] }));
    return points.some((p) => p.value !== null) ? lineOption(points, metric.label, metric.unit) : null;
  });
  protected readonly newestFirst = computed(() => [...this.stats().sessions].reverse());

  protected show(value: number | null): string {
    return value === null ? '—' : formatNumber(value);
  }
}
