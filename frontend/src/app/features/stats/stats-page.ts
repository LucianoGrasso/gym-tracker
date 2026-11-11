import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideTrophy } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { NgxEchartsDirective } from 'ngx-echarts';
import { apiErrorMessage } from '../../core/api/api-error';
import { BodyMetricsApi } from '../../core/api/body-metrics-api';
import { StatsApi } from '../../core/api/stats-api';
import { formatDate, localToday } from '../../core/format/format';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import { PERIOD_LABELS, STATS_PERIODS } from '../../core/models/labels';
import { DEFAULT_STATS_PERIOD, type StatsPeriod } from '../../core/models/stats';
import { formatSetsPerWeek } from '../../core/stats/muscle-sets';
import { parseDecimal } from '../../core/workout/set-suggestions';
import { consistencyOption, heatmapRange, lineOption } from '../../shared/charts/chart-options';
import { ChipGroup } from '../../shared/ui/chip-group';
import { formatRecentRecord } from './format-record';
import { MuscleSection } from './muscle-section';

import { AppSkeleton } from '../../shared/ui/app-skeleton';

@Component({
  selector: 'app-stats-page',
  imports: [RouterLink, NgIcon, HlmButton, HlmInput, NgxEchartsDirective, ChipGroup, AppSkeleton, MuscleSection],
  providers: [provideIcons({ lucideChevronRight, lucideTrophy })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="page-title mb-4">Estadísticas</h1>
    <app-chip-group
      class="mb-5 block"
      label="Período"
      [options]="periodOptions"
      [value]="period()"
      (valueChange)="period.set($any($event))"
    />

    @if (overview.error()) {
      <p class="mb-4 text-destructive">No se pudieron cargar las estadísticas.</p>
    } @else if (overview.value(); as o) {
      <dl class="mb-6 grid grid-cols-2 gap-3">
        <div class="card p-4">
          <dt class="eyebrow">Sesiones</dt>
          <dd class="num text-4xl font-bold text-primary">{{ o.sessions }}</dd>
        </div>
        <div class="card p-4">
          <dt class="eyebrow">Racha</dt>
          <dd class="num text-4xl font-bold">
            {{ o.streak_weeks }}<span class="ml-1 text-base text-muted-foreground"> sem</span>
          </dd>
        </div>
        <div class="card p-4">
          <dt class="eyebrow">Series efectivas</dt>
          <dd class="num text-4xl font-bold">{{ o.effective_sets }}</dd>
        </div>
        <div class="card p-4">
          <dt class="eyebrow">Sesiones/semana</dt>
          <dd class="num text-4xl font-bold">{{ formatSetsPerWeek(o.sessions_per_week) }}</dd>
        </div>
      </dl>
    } @else {
      <app-skeleton variant="list" [rows]="2" />
    }

    @if (muscles.error()) {
      <p class="mb-6 text-destructive">No se pudieron cargar las series por músculo.</p>
    } @else if (muscles.value(); as m) {
      <app-muscle-section [entries]="m.muscles" />
    } @else {
      <app-skeleton variant="list" [rows]="2" />
    }

    <!-- value() lanza si el recurso falló: se revisa error() primero. -->
    @if (!overview.error() && overview.value(); as o) {
      @if (o.recent_records.length) {
        <section class="mb-6">
          <h2 class="section-title mb-3">Récords recientes</h2>
          <ul class="flex flex-col gap-2">
            @for (r of o.recent_records; track r.exercise_id + r.type) {
              <li class="card flex items-center gap-3 p-4">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <ng-icon name="lucideTrophy" size="20" aria-hidden="true" />
                </span>
                <div class="min-w-0">
                  <p class="font-semibold">{{ r.exercise_name }}</p>
                  <p class="num text-base text-muted-foreground">
                    {{ formatRecentRecord(r) }} · {{ formatDate(r.date) }}
                  </p>
                </div>
              </li>
            }
          </ul>
        </section>
      }
    }

    <section class="card mb-6 p-4">
      <h2 class="section-title mb-1">Constancia</h2>
      @if (consistency.value(); as c) {
        <p class="mb-2 text-sm text-muted-foreground">
          Últimas semanas · {{ c.days.length }} {{ c.days.length === 1 ? 'día entrenado' : 'días entrenados' }} en el período
        </p>
        @if (consistencyChart(); as option) {
          <div echarts [options]="option" class="h-44" role="img" aria-label="Calendario de días entrenados"></div>
        }
      }
    </section>

    <section class="card mb-6 p-4">
      <h2 class="section-title mb-2">Peso corporal</h2>
      @if (bodyweightChart(); as option) {
        <div echarts [options]="option" class="h-48" role="img" aria-label="Peso corporal en el tiempo, en kg"></div>
      } @else {
        <p class="mb-2 text-sm text-muted-foreground">Todavía no hay registros de peso en este período.</p>
      }
      <form class="mt-3 flex gap-2" (submit)="$event.preventDefault(); saveBodyweight(bw)">
        <label class="sr-only" for="bodyweight">Peso de hoy (kg)</label>
        <input
          hlmInput
          id="bodyweight"
          #bw
          class="num h-12 flex-1 text-xl"
          inputmode="decimal"
          placeholder="Peso de hoy, ej.: 78,5"
        />
        <button hlmBtn type="submit" class="h-12" [disabled]="savingWeight()">Guardar</button>
      </form>
      @if (weightError()) {
        <p class="mt-2 text-sm text-destructive" role="alert">{{ weightError() }}</p>
      }
    </section>

    @if (overview.hasValue() && overview.value()?.exercises?.length) {
      <section>
        <h2 class="section-title mb-3">Por ejercicio</h2>
        <ul class="flex flex-col gap-2">
          @for (e of overview.value()!.exercises; track e.id) {
            <li>
              <a [routerLink]="['/estadisticas/ejercicios', e.id]" class="card flex items-center gap-3 p-4">
                <span class="flex-1 font-medium">{{ e.name }}</span>
                <span class="num text-base text-muted-foreground">
                  {{ e.sessions }} {{ e.sessions === 1 ? 'sesión' : 'sesiones' }}
                </span>
                <ng-icon name="lucideChevronRight" size="20" class="text-muted-foreground" />
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class StatsPage {
  private readonly api = inject(StatsApi);
  private readonly bodyMetrics = inject(BodyMetricsApi);
  private readonly db = inject(LOCAL_DB);

  protected readonly formatSetsPerWeek = formatSetsPerWeek;
  protected readonly formatDate = formatDate;
  protected readonly formatRecentRecord = formatRecentRecord;
  protected readonly periodOptions = STATS_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }));

  protected readonly period = signal<StatsPeriod>(DEFAULT_STATS_PERIOD);
  protected readonly savingWeight = signal(false);
  protected readonly weightError = signal<string | null>(null);

  protected readonly overview = resource({
    params: () => this.period(),
    loader: ({ params }) => cachedFetch(this.db, `stats:overview:${params}`, () => this.api.overview(params)),
  });
  protected readonly muscles = resource({
    params: () => this.period(),
    loader: ({ params }) => cachedFetch(this.db, `stats:muscles:${params}`, () => this.api.muscles(params)),
  });
  protected readonly consistency = resource({
    params: () => this.period(),
    loader: ({ params }) => cachedFetch(this.db, `stats:consistency:${params}`, () => this.api.consistency(params)),
  });
  protected readonly bodyweight = resource({
    params: () => this.period(),
    loader: ({ params }) => cachedFetch(this.db, `stats:bodyweight:${params}`, () => this.api.bodyweight(params)),
  });

  protected readonly consistencyChart = computed(() => {
    const c = this.consistency.value();
    return c && c.weeks.length ? consistencyOption(c.days, heatmapRange(c.weeks)) : null;
  });
  protected readonly bodyweightChart = computed(() => {
    const points = this.bodyweight.value()?.points ?? [];
    return points.length
      ? lineOption(points.map((p) => ({ date: p.date, value: p.bodyweight_kg })), 'Peso corporal', 'kg')
      : null;
  });

  protected async saveBodyweight(input: HTMLInputElement): Promise<void> {
    const kg = parseDecimal(input.value, 0);
    if (!kg) {
      this.weightError.set('Ingresa tu peso en kg, por ejemplo 78,5.');
      return;
    }
    this.savingWeight.set(true);
    this.weightError.set(null);
    try {
      await this.bodyMetrics.save(localToday(), kg);
      input.value = '';
      this.bodyweight.reload();
    } catch (e) {
      this.weightError.set(apiErrorMessage(e));
    } finally {
      this.savingWeight.set(false);
    }
  }
}
