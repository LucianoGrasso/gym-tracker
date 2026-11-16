import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHeartPulse } from '@ng-icons/lucide';
import type { ExerciseKind, MuscleGroup } from '../../core/models/exercise';
import { MiniBodyMap } from './body-map/mini-body-map';

/** Miniatura de un ejercicio en las listas: mapa corporal (fuerza) o corazón (cardio). */
@Component({
  selector: 'app-exercise-thumb',
  imports: [MiniBodyMap, NgIcon],
  providers: [provideIcons({ lucideHeartPulse })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let ex = exercise();
    @if (ex.kind === 'cardio') {
      <span data-cardio class="flex h-14 w-[22px] items-center justify-center text-primary" aria-hidden="true">
        <ng-icon name="lucideHeartPulse" size="22" />
      </span>
    } @else {
      <app-mini-body-map [primary]="ex.muscle_group" [secondaries]="ex.secondary_muscles" />
    }
  `,
})
export class ExerciseThumb {
  readonly exercise = input.required<{ kind?: ExerciseKind; muscle_group: MuscleGroup; secondary_muscles: MuscleGroup[] }>();
}
