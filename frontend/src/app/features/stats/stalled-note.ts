import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight } from '@ng-icons/lucide';
import { formatDate, formatKg } from '../../core/format/format';
import type { StalledExercise } from '../../core/models/stats';

export const STALLED_ALTERNATIVES =
  'Si sigue igual: cambia el rango de reps, descansa más entre series o prueba una variante.';

export function stalledLines(item: StalledExercise): { since: string; deload: string } {
  return {
    since: `Sin récord desde ${formatDate(item.best_date)} · ${item.sessions_since} sesiones`,
    deload:
      item.deload_kg === null
        ? 'Descarga: una semana sin lastre o con 2 reps menos por serie'
        : `Descarga: una semana con ${formatKg(item.deload_kg)}`,
  };
}

/** Las dos líneas de un ejercicio estancado (desde cuándo y qué descarga hacer). */
@Component({
  selector: 'app-stalled-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lines();
    <p class="num text-base text-muted-foreground">{{ l.since }}</p>
    <p class="text-sm font-semibold text-primary">{{ l.deload }}</p>
  `,
})
export class StalledNote {
  readonly item = input.required<StalledExercise>();
  protected readonly lines = computed(() => stalledLines(this.item()));
}

/** Sección "Estancados" de Estadísticas: no dibuja nada si la lista está vacía. */
@Component({
  selector: 'app-stalled-section',
  imports: [RouterLink, NgIcon, StalledNote],
  providers: [provideIcons({ lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section class="mb-6">
        <h2 class="section-title mb-3">Estancados</h2>
        <ul class="flex flex-col gap-2">
          @for (s of items(); track s.exercise_id) {
            <li>
              <a [routerLink]="['/estadisticas/ejercicios', s.exercise_id]" class="card flex items-center gap-3 p-4">
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{{ s.name }}</p>
                  <app-stalled-note [item]="s" />
                </div>
                <ng-icon name="lucideChevronRight" size="20" class="text-muted-foreground" />
              </a>
            </li>
          }
        </ul>
        <p class="mt-2 text-sm text-muted-foreground">{{ alternatives }}</p>
      </section>
    }
  `,
})
export class StalledSection {
  readonly items = input.required<StalledExercise[]>();
  protected readonly alternatives = STALLED_ALTERNATIVES;
}
