import {
  CdkDrag,
  type CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { WEEKDAYS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { RoutineDay } from '../../core/models/routine';
import { boardOrder, moveDay } from '../../core/routine/schedule';
import { RoutineDayCard } from './routine-day-card';

/** Semana de la rutina: 7 filas + "Sin día fijo". Arrastrar intercambia o mueve días. */
@Component({
  selector: 'app-weekly-board',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, RoutineDayCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div cdkDropListGroup class="mb-6">
      <ol class="mb-4 flex flex-col gap-2">
        @for (w of weekdays; track w) {
          <li class="flex items-center gap-2">
            <span class="num w-10 shrink-0 text-sm font-semibold text-muted-foreground">{{ shortLabel(w) }}</span>
            <div
              cdkDropList
              cdkDropListSortingDisabled
              [cdkDropListData]="w"
              (cdkDropListDropped)="drop($event)"
              [attr.data-weekday]="w"
              class="min-h-16 min-w-0 flex-1"
            >
              @if (byWeekday().get(w); as day) {
                <app-routine-day-card
                  cdkDrag
                  [cdkDragData]="day.id"
                  [day]="day"
                  (duplicateDay)="duplicateDay.emit(day)"
                  (removeDay)="removeDay.emit(day)"
                />
              } @else {
                <p class="flex h-16 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                  Descanso
                </p>
              }
            </div>
          </li>
        }
      </ol>

      <h3 class="mb-2 text-sm font-semibold text-muted-foreground">Sin día fijo</h3>
      <div
        cdkDropList
        [cdkDropListData]="null"
        (cdkDropListDropped)="drop($event)"
        data-tray
        class="flex min-h-16 flex-col gap-2"
      >
        @for (day of tray(); track day.id) {
          <app-routine-day-card
            cdkDrag
            [cdkDragData]="day.id"
            [day]="day"
            (duplicateDay)="duplicateDay.emit(day)"
            (removeDay)="removeDay.emit(day)"
          />
        } @empty {
          <p class="flex h-16 items-center justify-center rounded-xl border border-dashed border-border px-3 text-center text-sm text-muted-foreground">
            Arrastra aquí un día para dejarlo sin día fijo.
          </p>
        }
      </div>
    </div>
  `,
})
export class WeeklyBoard {
  readonly days = input.required<RoutineDay[]>();
  /** Todos los días en orden de tablero, con weekday y position nuevos. */
  readonly moved = output<RoutineDay[]>();
  readonly duplicateDay = output<RoutineDay>();
  readonly removeDay = output<RoutineDay>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly byWeekday = computed(
    () => new Map(this.days().filter((d) => d.weekday !== null).map((d) => [d.weekday!, d])),
  );
  protected readonly tray = computed(() => boardOrder(this.days()).filter((d) => d.weekday === null));

  protected shortLabel(weekday: number): string {
    return WEEKDAY_LABELS[weekday].slice(0, 3).toUpperCase();
  }

  /** Cada lista lleva su día de la semana (o null = bandeja) y cada tarjeta el id del día. */
  drop<T extends number | null>(event: CdkDragDrop<T>): void {
    const target: number | null = event.container.data;
    const sameList = event.previousContainer === event.container;
    if (sameList && (target !== null || event.previousIndex === event.currentIndex)) return;
    this.moved.emit(moveDay(this.days(), event.item.data as number, target, event.currentIndex));
  }
}
