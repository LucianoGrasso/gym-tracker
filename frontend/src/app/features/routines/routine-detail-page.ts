import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideGripVertical, lucideTrash2 } from '@ng-icons/lucide';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { apiErrorMessage } from '../../core/api/api-error';
import { RoutinesApi } from '../../core/api/routines-api';
import { WEEKDAYS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { Routine, RoutineDay } from '../../core/models/routine';
import { SELECT_CLASS } from '../../shared/ui/form-styles';

import { AppSkeleton } from '../../shared/ui/app-skeleton';

@Component({
  selector: 'app-routine-detail-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    NgIcon,
    HlmBadge,
    HlmButton,
    HlmInput,
    HlmLabel,
    AppSkeleton
  ],
  providers: [provideIcons({ lucideGripVertical, lucideCopy, lucideTrash2 })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/rutinas" class="mb-4 inline-block text-sm text-muted-foreground">← Rutinas</a>
    @if (agregada()) {
      <p
        class="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
        role="status"
      >
        Rutina agregada. Actívala cuando quieras empezarla.
      </p>
    }

    @if (routine(); as r) {
      <form class="mb-2 flex gap-2" (submit)="$event.preventDefault(); rename(r)">
        <input
          hlmInput
          class="h-12 flex-1 text-lg font-semibold"
          [value]="r.name"
          #name
          (change)="draftName.set(name.value)"
          aria-label="Nombre de la rutina"
        />
        <button hlmBtn type="submit" variant="outline" class="h-12" [disabled]="!draftName()">
          Guardar
        </button>
      </form>
      <div class="mb-6 flex items-center gap-3">
        @if (r.is_active) {
          <span hlmBadge>Activa</span>
        } @else {
          <button hlmBtn variant="outline" class="h-12" (click)="activate(r)">
            Marcar como activa
          </button>
        }
      </div>

      @if (error()) {
        <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p>
      }

      <h2 class="mb-2 section-title">Días</h2>
      <ul
        cdkDropList
        cdkDropListLockAxis="y"
        (cdkDropListDropped)="dropDay($event)"
        class="mb-6 flex flex-col gap-2"
      >
        @for (day of r.days; track day.id) {
          <li cdkDrag class="flex items-center gap-2 card p-2">
            <button
              cdkDragHandle
              type="button"
              class="flex size-12 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
              aria-label="Arrastrar para reordenar"
            >
              <ng-icon name="lucideGripVertical" size="20" />
            </button>
            <a [routerLink]="['/rutinas', r.id, 'dias', day.id]" class="min-w-0 flex-1 py-2">
              <span class="block truncate font-medium">{{ day.name }}</span>
              <span class="text-sm text-muted-foreground">
                {{ day.weekday ? weekdayLabels[day.weekday] : 'Sin día fijo' }} ·
                {{ day.exercises?.length ?? 0 }} ejercicios
              </span>
            </a>
            <button
              hlmBtn
              variant="ghost"
              size="icon-lg"
              (click)="duplicate(day)"
              aria-label="Duplicar día"
            >
              <ng-icon name="lucideCopy" />
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="icon-lg"
              (click)="removeDay(day)"
              aria-label="Eliminar día"
            >
              <ng-icon name="lucideTrash2" />
            </button>
          </li>
        } @empty {
          <li class="text-muted-foreground">Agrega el primer día de la rutina.</li>
        }
      </ul>

      <h2 class="mb-2 section-title">Agregar día</h2>
      <form
        [formGroup]="dayForm"
        (ngSubmit)="addDay(r)"
        class="mb-8 flex flex-col gap-3"
        novalidate
      >
        <div class="flex flex-col gap-2">
          <label hlmLabel for="day_name">Nombre</label>
          <input
            hlmInput
            id="day_name"
            formControlName="name"
            placeholder="Ej.: Lunes – Pecho"
            class="h-12 text-base"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="day_weekday">Día de la semana</label>
          <select id="day_weekday" formControlName="weekday" [class]="selectClass">
            <option [ngValue]="null">Sin día fijo</option>
            @for (w of weekdays; track w) {
              <option [ngValue]="w">{{ weekdayLabels[w] }}</option>
            }
          </select>
        </div>
        <button hlmBtn type="submit" class="h-12" [disabled]="dayForm.invalid">Agregar día</button>
      </form>

      <button hlmBtn variant="destructive" class="h-12 w-full" (click)="removeRoutine(r)">
        Eliminar rutina
      </button>
    } @else if (error()) {
      <p class="text-destructive">{{ error() }}</p>
    } @else {
      <app-skeleton variant="page" />
    }
  `,
})
export class RoutineDetailPage implements OnInit {
  private readonly api = inject(RoutinesApi);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  /** `?agregada=1` al llegar desde una plantilla recién importada. */
  readonly agregada = input<string>();

  protected readonly selectClass = SELECT_CLASS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly routine = signal<Routine | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly draftName = signal('');

  protected readonly dayForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    weekday: new FormControl<number | null>(null),
  });

  ngOnInit(): Promise<void> {
    return this.load();
  }

  private async load(): Promise<void> {
    try {
      this.routine.set(await this.api.get(Number(this.id())));
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    try {
      await action();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
    await this.load();
  }

  rename(routine: Routine): Promise<void> {
    return this.run(() =>
      this.api.update(routine.id, { name: this.draftName(), notes: routine.notes }),
    );
  }

  activate(routine: Routine): Promise<void> {
    return this.run(() => this.api.activate(routine.id));
  }

  async dropDay(event: CdkDragDrop<RoutineDay[]>): Promise<void> {
    const routine = this.routine();
    if (!routine?.days || event.previousIndex === event.currentIndex) return;
    const days = [...routine.days];
    moveItemInArray(days, event.previousIndex, event.currentIndex);
    this.routine.set({ ...routine, days });
    await this.run(() =>
      this.api.reorderDays(
        routine.id,
        days.map((d) => d.id),
      ),
    );
  }

  async addDay(routine: Routine): Promise<void> {
    const { name, weekday } = this.dayForm.getRawValue();
    await this.run(async () => {
      await this.api.createDay(routine.id, { name: name.trim(), weekday });
      this.dayForm.reset({ name: '', weekday: null });
    });
  }

  duplicate(day: RoutineDay): Promise<void> {
    return this.run(() => this.api.duplicateDay(day.id));
  }

  async removeDay(day: RoutineDay): Promise<void> {
    if (!confirm(`¿Eliminar el día "${day.name}"?`)) return;
    await this.run(() => this.api.removeDay(day.id));
  }

  async removeRoutine(routine: Routine): Promise<void> {
    if (
      !confirm(`¿Eliminar la rutina "${routine.name}"? El historial de entrenamientos se conserva.`)
    )
      return;
    try {
      await this.api.remove(routine.id);
      await this.router.navigateByUrl('/rutinas');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
