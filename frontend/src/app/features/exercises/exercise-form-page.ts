import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/api/api-error';
import { ExercisesApi } from '../../core/api/exercises-api';
import type { Equipment, ExerciseInput, MuscleGroup } from '../../core/models/exercise';
import { EQUIPMENTS, EQUIPMENT_LABELS, MUSCLE_GROUPS, MUSCLE_GROUP_LABELS } from '../../core/models/labels';
import { SELECT_CLASS } from '../../shared/ui/form-styles';

@Component({
  selector: 'app-exercise-form-page',
  imports: [ReactiveFormsModule, RouterLink, HlmButton, HlmInput, HlmLabel, HlmTextarea],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-6 text-2xl font-bold">{{ id() ? 'Editar ejercicio' : 'Nuevo ejercicio' }}</h1>

    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-5" novalidate>
      <div class="flex flex-col gap-2">
        <label hlmLabel for="name">Nombre</label>
        <input hlmInput id="name" formControlName="name" class="h-12 text-base" autocomplete="off" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-2">
          <label hlmLabel for="muscle_group">Grupo muscular</label>
          <select id="muscle_group" formControlName="muscle_group" [class]="selectClass">
            @for (g of groups; track g) { <option [ngValue]="g">{{ muscleLabels[g] }}</option> }
          </select>
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="equipment">Equipamiento</label>
          <select id="equipment" formControlName="equipment" [class]="selectClass">
            @for (e of equipments; track e) { <option [ngValue]="e">{{ equipmentLabels[e] }}</option> }
          </select>
        </div>
      </div>
      <label class="flex min-h-12 items-center gap-3">
        <input type="checkbox" class="size-5" formControlName="is_unilateral" />
        Unilateral (se registra cada lado por separado)
      </label>
      <label class="flex min-h-12 items-center gap-3">
        <input type="checkbox" class="size-5" formControlName="uses_bodyweight" />
        Usa peso corporal (el peso anotado es extra)
      </label>
      <div class="flex flex-col gap-2">
        <label hlmLabel for="notes">Notas</label>
        <textarea hlmTextarea id="notes" formControlName="notes" rows="3" class="text-base"></textarea>
      </div>

      @if (error()) { <p class="text-sm text-destructive" role="alert">{{ error() }}</p> }

      <div class="flex gap-3">
        <a hlmBtn variant="outline" class="h-12 flex-1" [routerLink]="id() ? ['/ejercicios', id()] : '/ejercicios'">Cancelar</a>
        <button hlmBtn type="submit" class="h-12 flex-1" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </form>
  `,
})
export class ExerciseFormPage implements OnInit {
  private readonly api = inject(ExercisesApi);
  private readonly router = inject(Router);

  /** Parámetro de ruta `:id` (ausente al crear). */
  readonly id = input<string>();

  protected readonly selectClass = SELECT_CLASS;
  protected readonly groups = MUSCLE_GROUPS;
  protected readonly equipments = EQUIPMENTS;
  protected readonly muscleLabels = MUSCLE_GROUP_LABELS;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    muscle_group: new FormControl<MuscleGroup>('chest', { nonNullable: true }),
    equipment: new FormControl<Equipment>('barbell', { nonNullable: true }),
    is_unilateral: new FormControl(false, { nonNullable: true }),
    uses_bodyweight: new FormControl(false, { nonNullable: true }),
    notes: new FormControl<string | null>(null),
  });

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      const exercise = await this.api.get(Number(id));
      this.form.patchValue(exercise);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.error.set('El nombre es obligatorio.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const input: ExerciseInput = { ...this.form.getRawValue(), notes: this.form.value.notes || null };
    try {
      const id = this.id();
      const saved = id ? await this.api.update(Number(id), input) : await this.api.create(input);
      await this.router.navigate(['/ejercicios', saved.id]);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
