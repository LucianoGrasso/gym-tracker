import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import type { MuscleGroup } from '../../../core/models/exercise';
import { MUSCLE_GROUP_LABELS } from '../../../core/models/labels';
import { muscleColor } from '../../../core/stats/muscle-sets';
import { BODY_VIEWS, MIRROR } from './body-map-shapes';

/**
 * Cuerpo de frente y de espalda, lado a lado; cada músculo pintado según su intensidad (0–1).
 * Reutilizable: las estadísticas pasan series/semana y la ficha de un ejercicio, principal/secundario.
 */
@Component({
  selector: 'app-body-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .muscle {
      cursor: pointer;
      outline: none;
      transition: fill 300ms ease;
    }
    .muscle path {
      stroke: #181a15;
      stroke-width: 0.8;
      stroke-linejoin: round;
      transition: stroke 150ms ease;
    }
    .muscle[aria-pressed='true'] path,
    .muscle:focus-visible path {
      stroke: #f2f4ec;
      stroke-width: 1.2;
    }
  `,
  template: `
    <svg
      viewBox="0 0 220 210"
      class="mx-auto block w-full max-w-[22rem]"
      role="group"
      aria-label="Mapa de músculos"
    >
      @for (view of views; track view.id) {
        <g [attr.transform]="'translate(' + view.x + ' 0)'">
          @for (part of view.neutral; track $index) {
            @for (d of part.paths; track $index) {
              <path [attr.d]="d" fill="#20231c" />
              @if (part.mirror) {
                <path [attr.d]="d" [attr.transform]="mirror" fill="#20231c" />
              }
            }
          }
          @for (shape of view.muscles; track shape.muscle) {
            <g
              class="muscle"
              role="button"
              tabindex="0"
              [attr.data-muscle]="shape.muscle"
              [attr.fill]="fill(shape.muscle)"
              [attr.aria-label]="labels()[shape.muscle] ?? muscleLabels[shape.muscle]"
              [attr.aria-pressed]="selected() === shape.muscle"
              (click)="selected.set(shape.muscle)"
              (keydown.enter)="selected.set(shape.muscle)"
              (keydown.space)="$event.preventDefault(); selected.set(shape.muscle)"
            >
              @for (d of shape.paths; track $index) {
                <path [attr.d]="d" />
                @if (shape.mirror) {
                  <path [attr.d]="d" [attr.transform]="mirror" />
                }
              }
            </g>
          }
        </g>
      }
    </svg>
    <div class="mx-auto grid max-w-[22rem] grid-cols-2 text-center" aria-hidden="true">
      @for (view of views; track view.id) {
        <span class="eyebrow">{{ view.label }}</span>
      }
    </div>
  `,
})
export class BodyMap {
  /** Intensidad por músculo, de 0 (gris) a 1 (lima). */
  readonly intensities = input<Partial<Record<MuscleGroup, number>>>({});
  /** Texto accesible por músculo; si falta, su nombre. */
  readonly labels = input<Partial<Record<MuscleGroup, string>>>({});
  readonly selected = model<MuscleGroup | null>(null);

  protected readonly views = BODY_VIEWS;
  protected readonly mirror = MIRROR;
  protected readonly muscleLabels = MUSCLE_GROUP_LABELS;

  protected fill(muscle: MuscleGroup): string {
    return muscleColor(this.intensities()[muscle] ?? 0);
  }
}
