import { ChangeDetectionStrategy, Component, OnInit, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import type { Exercise, SetType } from '../../core/models/exercise';
import { SET_TYPES, SET_TYPE_LABELS } from '../../core/models/labels';
import type { RoutineDayExercise, RoutineDayExerciseInput } from '../../core/models/routine';
import { SELECT_CLASS } from '../../shared/ui/form-styles';

@Component({
  selector: 'app-routine-exercise-form',
  imports: [ReactiveFormsModule, HlmButton, HlmInput, HlmLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
      @if (exercises(); as list) {
        <div class="flex flex-col gap-2">
          <label hlmLabel for="exercise_id">Ejercicio</label>
          <select id="exercise_id" formControlName="exercise_id" [class]="selectClass">
            <option [ngValue]="null" disabled>Elige un ejercicio</option>
            @for (exercise of list; track exercise.id) { <option [ngValue]="exercise.id">{{ exercise.name }}</option> }
          </select>
        </div>
      }
      <div class="grid grid-cols-3 gap-3">
        <div class="flex flex-col gap-2">
          <label hlmLabel for="target_sets">Series</label>
          <input hlmInput id="target_sets" type="number" inputmode="numeric" min="1" max="20" formControlName="target_sets" class="h-12 text-base" />
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="target_reps_min">Reps mín.</label>
          <input hlmInput id="target_reps_min" type="number" inputmode="numeric" min="1" formControlName="target_reps_min" class="h-12 text-base" />
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="target_reps_max">Reps máx.</label>
          <input hlmInput id="target_reps_max" type="number" inputmode="numeric" min="1" formControlName="target_reps_max" class="h-12 text-base" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-2">
          <label hlmLabel for="default_set_type">Tipo de serie</label>
          <select id="default_set_type" formControlName="default_set_type" [class]="selectClass">
            @for (type of setTypes; track type) { <option [ngValue]="type">{{ setTypeLabels[type] }}</option> }
          </select>
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="rest_seconds">Descanso (s)</label>
          <input hlmInput id="rest_seconds" type="number" inputmode="numeric" min="0" max="900" step="15" formControlName="rest_seconds" class="h-12 text-base" />
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <label hlmLabel for="target_text">Indicación (opcional)</label>
        <input hlmInput id="target_text" formControlName="target_text" placeholder="Ej.: ~30 reps explosivas" class="h-12 text-base" />
      </div>
      <div class="flex flex-col gap-2">
        <label hlmLabel for="notes">Notas (opcional)</label>
        <input hlmInput id="notes" formControlName="notes" class="h-12 text-base" />
      </div>

      @if (error()) { <p class="text-sm text-destructive" role="alert">{{ error() }}</p> }

      <div class="flex gap-3">
        <button hlmBtn type="button" variant="outline" class="h-12 flex-1" (click)="cancelled.emit()">Cancelar</button>
        <button hlmBtn type="submit" class="h-12 flex-1">{{ submitLabel() }}</button>
      </div>
    </form>
  `,
})
export class RoutineExerciseForm implements OnInit {
  /** Ejercicios elegibles; null al editar (el ejercicio no cambia). */
  readonly exercises = input<Exercise[] | null>(null);
  readonly initial = input<RoutineDayExercise | null>(null);
  readonly submitLabel = input('Guardar');

  readonly saved = output<RoutineDayExerciseInput>();
  readonly cancelled = output<void>();

  protected readonly selectClass = SELECT_CLASS;
  protected readonly setTypes = SET_TYPES;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    exercise_id: new FormControl<number | null>(null),
    target_sets: new FormControl(3, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(20)] }),
    target_reps_min: new FormControl<number | null>(8),
    target_reps_max: new FormControl<number | null>(12),
    target_text: new FormControl<string | null>(null),
    default_set_type: new FormControl<SetType>('normal', { nonNullable: true }),
    rest_seconds: new FormControl(120, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(900)] }),
    notes: new FormControl<string | null>(null),
  });

  ngOnInit(): void {
    const initial = this.initial();
    if (initial) {
      this.form.patchValue({ ...initial, exercise_id: initial.exercise.id });
    }
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    if (value.exercise_id === null) {
      this.error.set('Elige un ejercicio.');
      return;
    }
    if (this.form.invalid) {
      this.error.set('Revisa las series y el descanso.');
      return;
    }
    if (value.target_reps_min !== null && value.target_reps_max !== null && value.target_reps_max < value.target_reps_min) {
      this.error.set('El máximo de reps no puede ser menor que el mínimo.');
      return;
    }
    this.error.set(null);
    this.saved.emit({
      ...value,
      exercise_id: value.exercise_id,
      target_text: value.target_text || null,
      notes: value.notes || null,
    });
  }
}
