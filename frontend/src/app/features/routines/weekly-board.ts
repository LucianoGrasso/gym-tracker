import {
  CdkDrag,
  type CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { WEEKDAYS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { RoutineDay } from '../../core/models/routine';
import { boardOrder, moveDay } from '../../core/routine/schedule';
import { RoutineDayCard } from './routine-day-card';

/** Lo que muestra una fila mientras se arrastra (vista previa de cómo quedará). */
interface SlotView {
  /** Nombre del día que llegaría a esta fila. */
  ghost: string | null;
  rest: boolean;
  /** El día de esta fila se iría a otro lado (intercambio). */
  note: string | null;
}

const LANDED_MS = 900;

/** Semana de la rutina: 7 filas + "Sin día fijo". Arrastrar intercambia o mueve días. */
@Component({
  selector: 'app-weekly-board',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, RoutineDayCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div cdkDropListGroup class="mb-6">
      <ol class="mb-4 flex flex-col gap-2">
        @for (w of weekdays; track w) {
          @let view = slot(w);
          <li class="flex items-center gap-2">
            <span class="num w-10 shrink-0 text-sm font-semibold text-muted-foreground">{{ shortLabel(w) }}</span>
            <div
              cdkDropList
              cdkDropListSortingDisabled
              [cdkDropListData]="w"
              (cdkDropListDropped)="drop($event)"
              (cdkDropListEntered)="enter(w)"
              [attr.data-weekday]="w"
              class="board-slot grid min-h-[4.125rem] min-w-0 flex-1 grid-cols-[minmax(0,1fr)]"
            >
              @if (byWeekday().get(w); as day) {
                <app-routine-day-card
                  cdkDrag
                  [cdkDragData]="day.id"
                  cdkDragPreviewClass="board-preview"
                  (cdkDragStarted)="startDrag(day)"
                  (cdkDragEnded)="endDrag()"
                  [day]="day"
                  [class.opacity-40]="!!view.note"
                  [class.routine-activated]="landed().has(day.id)"
                  (duplicateDay)="duplicateDay.emit(day)"
                  (removeDay)="removeDay.emit(day)"
                />
              }
              @if (view.note) {
                <span class="board-note">↔ {{ view.note }}</span>
              }
              @if (view.ghost) {
                <p class="board-ghost">{{ view.ghost }}</p>
              } @else if (view.rest) {
                <p class="board-rest">Descanso</p>
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
        (cdkDropListEntered)="enter(null)"
        data-tray
        class="flex min-h-[4.125rem] flex-col gap-2"
      >
        @for (day of tray(); track day.id) {
          <app-routine-day-card
            cdkDrag
            [cdkDragData]="day.id"
            cdkDragPreviewClass="board-preview"
            (cdkDragStarted)="startDrag(day)"
            (cdkDragEnded)="endDrag()"
            [day]="day"
            [class.routine-activated]="landed().has(day.id)"
            (duplicateDay)="duplicateDay.emit(day)"
            (removeDay)="removeDay.emit(day)"
          />
        } @empty {
          <p class="board-rest px-3 text-center">Arrastra aquí un día para dejarlo sin día fijo.</p>
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

  /** Día que se está arrastrando y lista sobre la que está (null = bandeja). */
  private readonly dragging = signal<RoutineDay | null>(null);
  private readonly hover = signal<number | null>(null);
  /** Días recién movidos: hacen el pulso lima un momento. */
  protected readonly landed = signal<ReadonlySet<number>>(new Set());
  private landedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.landedTimer));
  }

  protected shortLabel(weekday: number): string {
    return WEEKDAY_LABELS[weekday].slice(0, 3).toUpperCase();
  }

  startDrag(day: RoutineDay): void {
    this.dragging.set(day);
    this.hover.set(day.weekday);
  }

  enter(target: number | null): void {
    this.hover.set(target);
  }

  endDrag(): void {
    this.dragging.set(null);
  }

  protected slot(weekday: number): SlotView {
    const occupant = this.byWeekday().get(weekday) ?? null;
    const idle: SlotView = { ghost: null, rest: !occupant, note: null };
    const dragged = this.dragging();
    const target = this.hover();
    if (!dragged || target === dragged.weekday) return idle;

    if (weekday === target) {
      return occupant
        ? { ghost: null, rest: false, note: `Pasa a ${placeName(dragged.weekday)}` }
        : { ghost: dragged.name, rest: false, note: null };
    }
    if (weekday === dragged.weekday) {
      const incoming = target === null ? null : (this.byWeekday().get(target) ?? null);
      return incoming ? { ghost: incoming.name, rest: false, note: null } : { ghost: null, rest: true, note: null };
    }
    return idle;
  }

  /** Cada lista lleva su día de la semana (o null = bandeja) y cada tarjeta el id del día. */
  drop<T extends number | null>(event: CdkDragDrop<T>): void {
    const target: number | null = event.container.data;
    const sameList = event.previousContainer === event.container;
    this.endDrag();
    if (sameList && (target !== null || event.previousIndex === event.currentIndex)) return;

    const id = event.item.data as number;
    const displaced = target === null ? undefined : this.byWeekday().get(target);
    this.pulse(displaced ? [id, displaced.id] : [id]);
    this.moved.emit(moveDay(this.days(), id, target, event.currentIndex));
  }

  private pulse(ids: number[]): void {
    clearTimeout(this.landedTimer);
    this.landed.set(new Set(ids));
    this.landedTimer = setTimeout(() => this.landed.set(new Set()), LANDED_MS);
  }
}

function placeName(weekday: number | null): string {
  return weekday === null ? 'sin día fijo' : WEEKDAY_LABELS[weekday].toLowerCase();
}
