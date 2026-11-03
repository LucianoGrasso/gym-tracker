import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { TodayApi } from '../../core/api/today-api';
import { formatDate } from '../../core/format/format';
import { formatBestSet, formatTargets } from '../../core/format/training';
import { SET_TYPE_LABELS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { TodayExercise } from '../../core/models/routine';

@Component({
  selector: 'app-today-page',
  imports: [RouterLink, HlmBadge, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (today.value(); as t) {
      <p class="text-sm text-muted-foreground">{{ weekdayLabels[t.weekday] }} {{ formatDate(t.date) }}</p>

      @if (!t.routine) {
        <h1 class="mt-1 mb-4 text-2xl font-bold">No tienes una rutina activa</h1>
        <a hlmBtn routerLink="/rutinas" class="h-12 w-full">Ir a rutinas</a>
      } @else if (t.day; as day) {
        <h1 class="mt-1 mb-4 text-2xl font-bold">{{ day.name }}</h1>

        <ol class="mb-6 flex flex-col gap-3">
          @for (item of day.exercises; track item.id) {
            <li class="rounded-lg border border-border p-4">
              <div class="flex items-start justify-between gap-2">
                <span class="font-semibold">{{ item.exercise.name }}</span>
                @if (item.default_set_type !== 'normal') {
                  <span hlmBadge variant="secondary">{{ setTypeLabels[item.default_set_type] }}</span>
                }
              </div>
              <p class="text-sm text-muted-foreground">{{ formatTargets(item) }}</p>
              @if (item.target_text) { <p class="text-sm text-muted-foreground">{{ item.target_text }}</p> }
              <p class="mt-2 text-sm">{{ lastTime(item) }}</p>
            </li>
          } @empty {
            <li class="text-muted-foreground">Este día no tiene ejercicios todavía.</li>
          }
        </ol>

        <button hlmBtn class="h-14 w-full text-base" disabled>Empezar entrenamiento</button>
        <p class="mt-2 text-center text-xs text-muted-foreground">El registro de series llega en la fase 3.</p>
      } @else {
        <h1 class="mt-1 mb-2 text-2xl font-bold">Hoy es día de descanso</h1>
        <p class="mb-4 text-muted-foreground">Días de {{ t.routine.name }}:</p>
        <ul class="flex flex-col gap-2">
          @for (d of t.days; track d.id) {
            <li>
              <a [routerLink]="['/rutinas', t.routine.id, 'dias', d.id]" class="block rounded-lg border border-border p-4">
                <span class="font-medium">{{ d.name }}</span>
                @if (d.weekday) { <span class="block text-sm text-muted-foreground">{{ weekdayLabels[d.weekday] }}</span> }
              </a>
            </li>
          }
        </ul>
      }
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

  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly formatTargets = formatTargets;

  protected readonly today = resource({ loader: () => this.api.get() });

  protected lastTime(item: TodayExercise): string {
    const last = item.last_performance;
    const best = last ? formatBestSet(last.sets, item.exercise.uses_bodyweight) : null;
    return last && best ? `Última vez: ${best} · ${formatDate(last.date)}` : 'Sin registros todavía';
  }
}
