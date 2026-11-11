import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MuscleGroup } from '../../../core/models/exercise';
import { exerciseIntensities, muscleColor } from '../../../core/stats/muscle-sets';
import { BODY_VIEWS, MIRROR } from './body-map-shapes';

/** Figura chica (frente o espalda, la que muestra el músculo principal) para las filas de la biblioteca. */
@Component({
  selector: 'app-mini-body-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="8 0 84 210" class="block h-14 w-auto" aria-hidden="true" [attr.data-view]="view().id">
      @for (part of view().neutral; track $index) {
        @for (d of part.paths; track $index) {
          <path [attr.d]="d" fill="#20231c" />
          @if (part.mirror) {
            <path [attr.d]="d" [attr.transform]="mirror" fill="#20231c" />
          }
        }
      }
      @for (shape of view().muscles; track shape.muscle) {
        <g [attr.data-muscle]="shape.muscle" [attr.fill]="fill(shape.muscle)">
          @for (d of shape.paths; track $index) {
            <path [attr.d]="d" />
            @if (shape.mirror) {
              <path [attr.d]="d" [attr.transform]="mirror" />
            }
          }
        </g>
      }
    </svg>
  `,
})
export class MiniBodyMap {
  readonly primary = input.required<MuscleGroup>();
  readonly secondaries = input<readonly MuscleGroup[]>([]);

  protected readonly mirror = MIRROR;
  protected readonly view = computed(() => {
    const [front, back] = BODY_VIEWS;
    return back.muscles.some((m) => m.muscle === this.primary()) &&
      !front.muscles.some((m) => m.muscle === this.primary())
      ? back
      : front;
  });
  private readonly intensities = computed(() => exerciseIntensities(this.primary(), this.secondaries()));

  protected fill(muscle: MuscleGroup): string {
    return muscleColor(this.intensities()[muscle] ?? 0);
  }
}
