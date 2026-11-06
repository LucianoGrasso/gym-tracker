import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideHistory,
  lucideListChecks,
  lucideMoon,
  lucidePlay,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { TodayApi } from '../../core/api/today-api';
import { AuthService } from '../../core/auth/auth.service';
import { formatDate } from '../../core/format/format';
import { firstName, greeting } from '../../core/format/greeting';
import { formatBestSet, formatTargets } from '../../core/format/training';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import { SET_TYPE_LABELS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { Today, TodayExercise } from '../../core/models/routine';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';

@Component({
  selector: 'app-today-page',
  imports: [RouterLink, NgTemplateOutlet, NgIcon, HlmButton],
  providers: [
    provideIcons({ lucideChevronRight, lucideHistory, lucideListChecks, lucideMoon, lucidePlay }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (today.value(); as t) {
      <header class="mb-5">
        <p class="eyebrow">{{ weekdayLabels[t.weekday] }} {{ formatDate(t.date) }}</p>
        <a routerLink="/cuenta" aria-label="Mi cuenta" class="block">
          <h1 class="page-title mt-1 text-4xl">
            {{ salute() }}@if (name()) {<span>,</span>
              <span class="block text-primary">{{ name() }}</span>
            }
          </h1        </a>
      </header>

      @if (!t.routine) {
        <section class="card p-5">
          <span class="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ng-icon name="lucideListChecks" size="22" aria-hidden="true" />
          </span>
          <h2 class="section-title text-2xl">Elige una plantilla para empezar</h2>
          <p class="mt-1 mb-4 text-sm text-muted-foreground">Parte con una rutina de un programa o atleta conocido, o crea la tuya.</p>
          <a hlmBtn routerLink="/rutinas/plantillas" class="h-12 w-full">Ver plantillas</a>
          <a routerLink="/rutinas" class="mt-3 block text-center text-sm text-muted-foreground underline">Ir a mis rutinas</a>
          <ng-container *ngTemplateOutlet="freeOrContinue; context: { $implicit: t }" />
        </section>
      } @else if (t.day; as day) {
        <section class="rounded-3xl bg-primary p-5 text-primary-foreground">
          <p class="text-xs font-semibold tracking-[0.1em] uppercase opacity-70">
            {{ sessions.activeId() ? 'Entrenamiento en curso' : 'Te toca hoy' }}
          </p>
          <h2 class="num mt-1 text-3xl leading-none font-bold uppercase">{{ day.name }}</h2>

          <dl class="mt-4 mb-5 flex gap-6">
            <div>
              <dt class="sr-only">Ejercicios</dt>
              <dd class="num text-4xl leading-none font-bold">{{ day.exercises.length }}<span class="ml-1 text-base font-semibold"> {{ day.exercises.length === 1 ? 'ejercicio' : 'ejercicios' }}</span></dd>
            </div>
            <div>
              <dt class="sr-only">Series objetivo</dt>
              <dd class="num text-4xl leading-none font-bold">{{ totalSets(day.exercises) }}<span class="ml-1 text-base font-semibold"> {{ totalSets(day.exercises) === 1 ? 'serie' : 'series' }}</span></dd>
            </div>
          </dl>

          @if (sessions.activeId(); as activeId) {
            <a
              class="num flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary-foreground text-xl font-bold tracking-wide text-primary uppercase"
              [routerLink]="['/entrenamiento', activeId]"
            >
              <ng-icon name="lucidePlay" size="20" aria-hidden="true" />Continuar entrenamiento
            </a>
          } @else {
            <button
              type="button"
              class="num flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary-foreground text-xl font-bold tracking-wide text-primary uppercase disabled:opacity-60"
              [disabled]="starting()"
              (click)="start(t)"
            >
              <ng-icon name="lucidePlay" size="20" aria-hidden="true" />Empezar entrenamiento
            </button>
          }
        </section>

        <h2 class="section-title mt-6 mb-3">Ejercicios</h2>
        <ol class="flex flex-col gap-2">
          @for (item of day.exercises; track item.id; let i = $index) {
            <li class="card flex gap-3 p-4">
              <span class="num flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">{{ i + 1 }}</span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <span class="text-lg leading-tight font-semibold">{{ item.exercise.name }}</span>
                  @if (item.default_set_type !== 'normal') {
                    <span class="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold tracking-wide text-primary uppercase">{{ setTypeLabels[item.default_set_type] }}</span>
                  }
                </div>
                <p class="num text-lg text-muted-foreground">{{ formatTargets(item) }}</p>
                @if (item.target_text) {
                  <p class="text-sm text-muted-foreground">{{ item.target_text }}</p>
                }
                <p class="mt-1 text-sm">{{ lastTime(item) }}</p>
              </div>
            </li>
          } @empty {
            <li class="text-muted-foreground">Este día no tiene ejercicios todavía.</li>
          }
        </ol>
      } @else {
        <section class="card p-5">
          <span class="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ng-icon name="lucideMoon" size="22" aria-hidden="true" />
          </span>
          <h2 class="section-title text-2xl">Hoy es día de descanso</h2>
          <p class="mt-1 text-sm text-muted-foreground">Recuperar también es entrenar. Si igual quieres moverte:</p>
          <ng-container *ngTemplateOutlet="freeOrContinue; context: { $implicit: t }" />
        </section>

        <h2 class="section-title mt-6 mb-3">Días de {{ t.routine.name }}</h2>
        <ul class="flex flex-col gap-2">
          @for (d of t.days; track d.id) {
            <li>
              <a [routerLink]="['/rutinas', t.routine.id, 'dias', d.id]" class="card flex items-center gap-3 p-4">
                <div class="min-w-0 flex-1">
                  @if (d.weekday) {
                    <span class="eyebrow block text-primary">{{ weekdayLabels[d.weekday] }}</span>
                  }
                  <span class="font-medium">{{ d.name }}</span>
                </div>
                <ng-icon name="lucideChevronRight" size="20" class="text-muted-foreground" />
              </a>
            </li>
          }
        </ul>
      }

      <a routerLink="/entrenamientos" class="card mt-6 flex items-center gap-3 p-4">
        <ng-icon name="lucideHistory" size="20" class="text-primary" aria-hidden="true" />
        <span class="flex-1 font-medium">Ver entrenamientos anteriores</span>
        <ng-icon name="lucideChevronRight" size="20" class="text-muted-foreground" />
      </a>

      <ng-template #freeOrContinue let-t>
        @if (sessions.activeId(); as activeId) {
          <a hlmBtn class="num mt-4 h-14 w-full text-xl font-bold tracking-wide uppercase" [routerLink]="['/entrenamiento', activeId]">Continuar entrenamiento</a>
        } @else {
          <button hlmBtn variant="outline" class="mt-4 h-12 w-full" [disabled]="starting()" (click)="startFree(t)">Sesión libre</button>
        }
      </ng-template>
    } @else if (today.error()) {
      <p class="text-destructive">No se pudo cargar el día de hoy.</p>
      <button hlmBtn variant="outline" class="mt-3 h-12 w-full" (click)="today.reload()">Reintentar</button>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class TodayPage {
  private readonly api = inject(TodayApi);
  private readonly db = inject(LOCAL_DB);
  private readonly router = inject(Router);
  protected readonly sessions = inject(WorkoutSessionService);
  private readonly auth = inject(AuthService);
  protected readonly starting = signal(false);

  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly formatTargets = formatTargets;

  protected readonly salute = signal(greeting());
  protected readonly name = computed(() => firstName(this.auth.user()?.name ?? ''));

  /** Con respaldo local: sin señal muestra el último "Hoy" descargado. */
  protected readonly today = resource({ loader: () => cachedFetch(this.db, 'today', () => this.api.get()) });

  protected async start(today: Today): Promise<void> {
    this.starting.set(true);
    try {
      const session = await this.sessions.startFromDay(today);
      await this.router.navigate(['/entrenamiento', session.id]);
    } finally {
      this.starting.set(false);
    }
  }

  protected async startFree(today: Today): Promise<void> {
    this.starting.set(true);
    try {
      const session = await this.sessions.startFree(today.date);
      await this.router.navigate(['/entrenamiento', session.id]);
    } finally {
      this.starting.set(false);
    }
  }

  /** Series objetivo del día (los ejercicios sin objetivo no suman). */
  protected totalSets(exercises: TodayExercise[]): number {
    return exercises.reduce((sum, item) => sum + (item.target_sets ?? 0), 0);
  }

  protected lastTime(item: TodayExercise): string {
    const last = item.last_performance;
    const best = last ? formatBestSet(last.sets, item.exercise.uses_bodyweight) : null;
    return last && best ? `Última vez: ${best} · ${formatDate(last.date)}` : 'Sin registros todavía';
  }
}
