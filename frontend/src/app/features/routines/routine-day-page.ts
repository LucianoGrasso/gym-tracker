import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGripVertical, lucidePencil, lucideTrash2 } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '../../core/api/api-error';
import { ExercisesApi } from '../../core/api/exercises-api';
import { RoutinesApi } from '../../core/api/routines-api';
import { formatRest, formatTargets } from '../../core/format/training';
import type { Exercise } from '../../core/models/exercise';
import { SET_TYPE_LABELS, WEEKDAYS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { RoutineDay, RoutineDayExercise, RoutineDayExerciseInput } from '../../core/models/routine';
import { SELECT_CLASS } from '../../shared/ui/form-styles';
import { RoutineExerciseForm } from './routine-exercise-form';

@Component({
  selector: 'app-routine-day-page',
  imports: [ReactiveFormsModule, RouterLink, CdkDropList, CdkDrag, CdkDragHandle, NgIcon, HlmButton, HlmInput, RoutineExerciseForm],
  providers: [provideIcons({ lucideGripVertical, lucidePencil, lucideTrash2 })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="['/rutinas', id()]" class="mb-4 inline-block text-sm text-muted-foreground">← Rutina</a>

    @if (day(); as d) {
      <form [formGroup]="dayForm" (ngSubmit)="saveDay(d)" class="mb-6 flex flex-col gap-3" novalidate>
        <input hlmInput formControlName="name" class="h-12 text-lg font-semibold" aria-label="Nombre del día" />
        <div class="flex gap-2">
          <select formControlName="weekday" [class]="selectClass" aria-label="Día de la semana">
            <option [ngValue]="null">Sin día fijo</option>
            @for (w of weekdays; track w) { <option [ngValue]="w">{{ weekdayLabels[w] }}</option> }
          </select>
          <button hlmBtn type="submit" variant="outline" class="h-12" [disabled]="dayForm.pristine || dayForm.invalid">Guardar</button>
        </div>
      </form>

      @if (error()) { <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p> }

      <ul cdkDropList (cdkDropListDropped)="drop($event)" class="mb-6 flex flex-col gap-2">
        @for (item of d.exercises; track item.id) {
          <li cdkDrag class="card p-2">
            @if (editingId() === item.id) {
              <p class="mb-3 px-2 font-medium">{{ item.exercise.name }}</p>
              <app-routine-exercise-form [initial]="item" submitLabel="Guardar"
                (saved)="update(item, $event)" (cancelled)="editingId.set(null)" />
            } @else {
              <div class="flex items-center gap-2">
                <button cdkDragHandle type="button" class="flex size-12 shrink-0 cursor-grab items-center justify-center text-muted-foreground" aria-label="Arrastrar para reordenar">
                  <ng-icon name="lucideGripVertical" size="20" />
                </button>
                <div class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{{ item.exercise.name }}</span>
                  <span class="text-sm text-muted-foreground">
                    {{ formatTargets(item) }} · {{ setTypeLabels[item.default_set_type] }} · {{ formatRest(item.rest_seconds) }}
                  </span>
                  @if (item.target_text) { <span class="block text-sm text-muted-foreground">{{ item.target_text }}</span> }
                </div>
                <button hlmBtn variant="ghost" size="icon-lg" (click)="editingId.set(item.id)" aria-label="Editar objetivos">
                  <ng-icon name="lucidePencil" />
                </button>
                <button hlmBtn variant="ghost" size="icon-lg" (click)="remove(item)" aria-label="Quitar del día">
                  <ng-icon name="lucideTrash2" />
                </button>
              </div>
            }
          </li>
        } @empty {
          <li class="text-muted-foreground">Este día no tiene ejercicios.</li>
        }
      </ul>

      @if (adding()) {
        <section class="card p-4">
          <h2 class="mb-3 section-title">Agregar ejercicio</h2>
          <app-routine-exercise-form [exercises]="availableExercises()" submitLabel="Agregar"
            (saved)="add(d, $event)" (cancelled)="adding.set(false)" />
        </section>
      } @else {
        <button hlmBtn class="h-12 w-full" (click)="startAdding()">Agregar ejercicio</button>
      }
    } @else if (error()) {
      <p class="text-destructive">{{ error() }}</p>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class RoutineDayPage implements OnInit {
  private readonly routinesApi = inject(RoutinesApi);
  private readonly exercisesApi = inject(ExercisesApi);

  readonly id = input.required<string>();
  readonly dayId = input.required<string>();

  protected readonly selectClass = SELECT_CLASS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly formatTargets = formatTargets;
  protected readonly formatRest = formatRest;

  protected readonly day = signal<RoutineDay | null>(null);
  protected readonly exercises = signal<Exercise[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly adding = signal(false);

  protected readonly availableExercises = computed(() => this.exercises());

  protected readonly dayForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    weekday: new FormControl<number | null>(null),
  });

  ngOnInit(): Promise<void> {
    return this.load();
  }

  private async load(): Promise<void> {
    try {
      const routine = await this.routinesApi.get(Number(this.id()));
      const day = routine.days?.find((d) => d.id === Number(this.dayId())) ?? null;
      if (!day) {
        this.error.set('No se encontró el día.');
        return;
      }
      this.day.set(day);
      this.dayForm.reset({ name: day.name, weekday: day.weekday });
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.error.set(null);
    try {
      await action();
      return true;
    } catch (e) {
      this.error.set(apiErrorMessage(e));
      return false;
    } finally {
      await this.load();
    }
  }

  saveDay(day: RoutineDay): Promise<boolean> {
    const { name, weekday } = this.dayForm.getRawValue();
    return this.run(() => this.routinesApi.updateDay(day.id, { name: name.trim(), weekday }));
  }

  async startAdding(): Promise<void> {
    if (this.exercises().length === 0) {
      try {
        this.exercises.set(await this.exercisesApi.list());
      } catch (e) {
        this.error.set(apiErrorMessage(e));
        return;
      }
    }
    this.adding.set(true);
  }

  async add(day: RoutineDay, input: RoutineDayExerciseInput): Promise<void> {
    if (await this.run(() => this.routinesApi.addExercise(day.id, input))) {
      this.adding.set(false);
    }
  }

  async update(item: RoutineDayExercise, input: RoutineDayExerciseInput): Promise<void> {
    const { exercise_id: _ignored, ...targets } = input;
    if (await this.run(() => this.routinesApi.updateExercise(item.id, targets))) {
      this.editingId.set(null);
    }
  }

  async remove(item: RoutineDayExercise): Promise<void> {
    if (!confirm(`¿Quitar "${item.exercise.name}" de este día?`)) return;
    await this.run(() => this.routinesApi.removeExercise(item.id));
  }

  async drop(event: CdkDragDrop<RoutineDayExercise[]>): Promise<void> {
    const day = this.day();
    if (!day?.exercises || event.previousIndex === event.currentIndex) return;
    const exercises = [...day.exercises];
    moveItemInArray(exercises, event.previousIndex, event.currentIndex);
    this.day.set({ ...day, exercises });
    await this.run(() => this.routinesApi.reorderExercises(day.id, exercises.map((e) => e.id)));
  }
}
