import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import { WEEKDAYS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { Today } from '../../core/models/routine';

type CellState = 'done' | 'pending' | 'rest';

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const STATE_LABELS: Record<CellState, string> = { done: 'hecho', pending: 'pendiente', rest: 'descanso' };

/** L M M J V S D: qué días de la rutina ya se entrenaron esta semana. */
@Component({
  selector: 'app-week-strip',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <section class="mb-5" aria-label="Esta semana">
        <ol class="flex justify-between gap-1">
          @for (cell of cells(); track cell.weekday) {
            <li
              class="flex flex-1 flex-col items-center gap-1.5"
              [attr.data-state]="cell.state"
              [attr.aria-label]="cell.label"
            >
              <span
                class="text-xs font-semibold"
                [class.text-primary]="cell.today"
                [class.text-muted-foreground]="!cell.today"
                aria-hidden="true"
                >{{ cell.letter }}</span
              >
              @switch (cell.state) {
                @case ('done') {
                  <span class="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <ng-icon name="lucideCheck" size="16" aria-hidden="true" />
                  </span>
                }
                @case ('pending') {
                  <span class="size-8 rounded-full border-2 border-primary/50"></span>
                }
                @default {
                  <span class="flex size-8 items-center justify-center">
                    <span class="size-1.5 rounded-full bg-muted-foreground/40"></span>
                  </span>
                }
              }
            </li>
          }
        </ol>
        <p class="mt-2 text-center text-sm text-muted-foreground">{{ done() }} de {{ total() }} días esta semana</p>
      </section>
    }
  `,
})
export class WeekStrip {
  readonly today = input.required<Today>();

  protected readonly cells = computed(() => {
    const t = this.today();
    const done = new Set(t.week?.done_day_ids ?? []);
    return WEEKDAYS.map((weekday, i) => {
      const day = t.days.find((d) => d.weekday === weekday);
      const state: CellState = !day ? 'rest' : done.has(day.id) ? 'done' : 'pending';
      return {
        weekday,
        letter: LETTERS[i],
        today: weekday === t.weekday,
        state,
        label: `${WEEKDAY_LABELS[weekday]}: ${STATE_LABELS[state]}`,
      };
    });
  });
  protected readonly total = computed(() => this.cells().filter((c) => c.state !== 'rest').length);
  protected readonly done = computed(() => this.cells().filter((c) => c.state === 'done').length);
}
