import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { MuscleGroup } from '../../core/models/exercise';
import { MUSCLE_GROUP_LABELS } from '../../core/models/labels';
import type { MuscleSetsEntry } from '../../core/models/stats';
import {
  formatMuscleDetail,
  formatSetsPerWeek,
  muscleIntensity,
} from '../../core/stats/muscle-sets';
import { BodyMap } from '../../shared/ui/body-map/body-map';
import { MuscleRanking } from '../../shared/ui/muscle-ranking';

/** Mapa corporal + detalle del músculo elegido + ranking; elegir en uno marca el otro. */
@Component({
  selector: 'app-muscle-section',
  imports: [BodyMap, MuscleRanking],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-6 p-4">
      <h2 class="section-title mb-1">Músculos</h2>
      <p class="mb-3 text-sm text-muted-foreground">
        Series efectivas por semana · referencia 10–20
      </p>
      <app-body-map [intensities]="intensities()" [labels]="ariaLabels()" [(selected)]="selected" />
      <p data-detail class="num mt-3 min-h-7 text-center text-lg" aria-live="polite">
        {{ detail() ?? 'Toca un músculo para ver sus series por semana.' }}
      </p>
    </section>

    <section class="card mb-6 p-4">
      <h2 class="section-title mb-2">Series por semana</h2>
      <app-muscle-ranking [entries]="entries()" [(selected)]="selected" />
    </section>
  `,
})
export class MuscleSection {
  readonly entries = input.required<MuscleSetsEntry[]>();

  protected readonly selected = signal<MuscleGroup | null>(null);

  protected readonly intensities = computed(() =>
    Object.fromEntries(this.entries().map((m) => [m.muscle, muscleIntensity(m.sets_per_week)])),
  );
  protected readonly ariaLabels = computed(() =>
    Object.fromEntries(
      this.entries().map((m) => [
        m.muscle,
        `${MUSCLE_GROUP_LABELS[m.muscle]}, ${formatSetsPerWeek(m.sets_per_week)} series por semana`,
      ]),
    ),
  );
  protected readonly detail = computed(() => {
    const entry = this.entries().find((m) => m.muscle === this.selected());
    return entry ? formatMuscleDetail(entry) : null;
  });
}
