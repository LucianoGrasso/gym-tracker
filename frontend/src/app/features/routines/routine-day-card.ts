import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideGripVertical, lucideTrash2 } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import type { RoutineDay } from '../../core/models/routine';

/** Tarjeta de un día en el tablero; el `cdkDrag` lo pone quien la usa, en el host. */
@Component({
  selector: 'app-routine-day-card',
  imports: [CdkDragHandle, RouterLink, NgIcon, HlmButton],
  providers: [provideIcons({ lucideCopy, lucideGripVertical, lucideTrash2 })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card flex items-center gap-2 p-2' },
  template: `
    <button
      cdkDragHandle
      type="button"
      class="flex size-12 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
      aria-label="Arrastrar para cambiar de día"
    >
      <ng-icon name="lucideGripVertical" size="20" />
    </button>
    <a [routerLink]="['/rutinas', day().routine_id, 'dias', day().id]" class="min-w-0 flex-1 py-2">
      <span class="block truncate font-medium">{{ day().name }}</span>
      <span class="text-sm text-muted-foreground">
        {{ count() }} {{ count() === 1 ? 'ejercicio' : 'ejercicios' }}
      </span>
    </a>
    <button hlmBtn variant="ghost" size="icon-lg" (click)="duplicateDay.emit()" aria-label="Duplicar día">
      <ng-icon name="lucideCopy" />
    </button>
    <button hlmBtn variant="ghost" size="icon-lg" (click)="removeDay.emit()" aria-label="Eliminar día">
      <ng-icon name="lucideTrash2" />
    </button>
  `,
})
export class RoutineDayCard {
  readonly day = input.required<RoutineDay>();
  readonly duplicateDay = output<void>();
  readonly removeDay = output<void>();

  protected readonly count = computed(() => this.day().exercises?.length ?? 0);
}
