import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { MuscleGroup } from '../../core/models/exercise';
import { MUSCLE_GROUP_LABELS } from '../../core/models/labels';
import type { MuscleSetsEntry } from '../../core/models/stats';
import {
  MUSCLE_RANGE,
  formatSetsPerWeek,
  muscleColor,
  muscleIntensity,
  rankMuscles,
} from '../../core/stats/muscle-sets';

/** Escala mínima de las barras: deja ver la banda 10–20 completa aunque se entrene poco. */
const MIN_SCALE = 25;

/** Barras horizontales de series/semana por músculo, con la banda de referencia 10–20 detrás. */
@Component({
  selector: 'app-muscle-ranking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="flex flex-col">
      @for (m of ranked(); track m.muscle) {
        <li>
          <button
            type="button"
            class="grid min-h-11 w-full grid-cols-[6.5rem_1fr_2.75rem] items-center gap-3 rounded-md px-1 text-left"
            [class.bg-muted]="selected() === m.muscle"
            [attr.aria-pressed]="selected() === m.muscle"
            (click)="selected.set(m.muscle)"
          >
            <span class="truncate" [class.text-muted-foreground]="m.sets === 0">{{
              labels[m.muscle]
            }}</span>
            <span class="relative h-3 overflow-hidden rounded-full bg-[#20231c]" aria-hidden="true">
              <span
                data-band
                class="absolute inset-y-0 bg-primary/15"
                [style.left.%]="percent(range.min)"
                [style.width.%]="percent(range.max - range.min)"
              ></span>
              <span
                data-bar
                class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                [style.width.%]="percent(m.sets_per_week)"
                [style.background]="color(m.sets_per_week)"
              ></span>
            </span>
            <span class="num text-right text-lg" [class.text-muted-foreground]="m.sets === 0">
              {{ format(m.sets_per_week) }}
            </span>
          </button>
        </li>
      }
    </ul>
  `,
})
export class MuscleRanking {
  readonly entries = input.required<MuscleSetsEntry[]>();
  readonly selected = model<MuscleGroup | null>(null);

  protected readonly labels = MUSCLE_GROUP_LABELS;
  protected readonly range = MUSCLE_RANGE;
  protected readonly format = formatSetsPerWeek;
  protected readonly ranked = computed(() => rankMuscles(this.entries()));
  private readonly scale = computed(() =>
    Math.max(MIN_SCALE, ...this.entries().map((m) => Math.ceil(m.sets_per_week * 1.1))),
  );

  protected percent(setsPerWeek: number): number {
    return Math.round((setsPerWeek / this.scale()) * 1000) / 10;
  }

  protected color(setsPerWeek: number): string {
    return muscleColor(muscleIntensity(setsPerWeek));
  }
}
