import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTrash2, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { formatDate } from '../../core/format/format';
import type { WorkoutSet } from '../../core/models/exercise';
import type { SessionExercise, WorkoutSetInput } from '../../core/models/workout';
import {
  formatCardioTotal,
  formatSegmentLine,
  formatSegments,
  stepHalf,
  stepMinutes,
  suggestNextSegment,
} from '../../core/workout/cardio';
import { formatNumber, parseDecimal, toSetInput } from '../../core/workout/set-suggestions';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { ConfirmService } from '../../shared/ui/confirm-dialog';

/** Tarjeta de un ejercicio de cardio: tramos hechos + steppers para el próximo. Sin descanso ni progresión. */
@Component({
  selector: 'app-cardio-card',
  imports: [NgIcon, HlmButton],
  providers: [provideIcons({ lucideTrash2, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let ex = item();
    <article class="card p-4" [class.border-2]="current()" [class.border-primary]="current()">
      <header class="mb-3 flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h2 class="text-lg leading-tight font-semibold">{{ ex.exercise.name }}</h2>
          @if (targetLine()) {
            <p class="num text-base text-muted-foreground">{{ targetLine() }}</p>
          }
          <p class="text-sm text-muted-foreground">{{ lastLine() }}</p>
        </div>
        @if (!finished()) {
          <button
            hlmBtn
            variant="ghost"
            size="icon-lg"
            class="shrink-0 text-muted-foreground"
            (click)="removeExercise()"
            aria-label="Quitar ejercicio de esta sesión"
          >
            <ng-icon name="lucideTrash2" />
          </button>
        }
      </header>

      @if (ex.sets.length) {
        <ol class="mb-2 flex flex-col gap-1.5">
          @for (set of ex.sets; track set.id; let i = $index) {
            <li
              class="flex min-h-12 items-center rounded-xl bg-muted pl-3"
              [class.ring-2]="editingSetId() === set.id"
              [class.ring-primary]="editingSetId() === set.id"
            >
              <button type="button" class="num flex flex-1 items-center gap-3 py-2 text-left" (click)="edit(set)">
                <span class="w-5 text-base text-muted-foreground">{{ i + 1 }}</span>
                <span class="text-lg font-semibold">{{ line(set) }}</span>
              </button>
              <button
                hlmBtn
                variant="ghost"
                size="icon-lg"
                class="text-muted-foreground"
                (click)="removeSet(set)"
                aria-label="Borrar tramo"
              >
                <ng-icon name="lucideX" />
              </button>
            </li>
          }
        </ol>
        <p class="num mb-4 text-base font-semibold">{{ total() }}</p>
      }

      <div class="grid grid-cols-3 gap-2">
        <div>
          <span class="eyebrow mb-1.5 block">Minutos</span>
          <div class="flex items-center rounded-xl border border-border bg-background">
            <button
              type="button"
              class="h-14 w-9 shrink-0 text-2xl"
              aria-label="Restar 1 min"
              (click)="patch({ duration_seconds: stepMinutes(seconds(), -1) })"
            >
              −
            </button>
            <input
              class="num w-full min-w-0 bg-transparent text-center text-2xl font-bold outline-none"
              inputmode="decimal"
              aria-label="Duración (min)"
              [value]="formatNumber(seconds() / 60)"
              (change)="setMinutes($any($event.target).value)"
            />
            <button
              type="button"
              class="h-14 w-9 shrink-0 text-2xl"
              aria-label="Sumar 1 min"
              (click)="patch({ duration_seconds: stepMinutes(seconds(), 1) })"
            >
              +
            </button>
          </div>
        </div>
        <div>
          <span class="eyebrow mb-1.5 block">km/h</span>
          <div class="flex items-center rounded-xl border border-border bg-background">
            <button
              type="button"
              class="h-14 w-9 shrink-0 text-2xl"
              aria-label="Restar 0,5 km/h"
              (click)="patch({ speed_kmh: stepHalf(entry().speed_kmh ?? null, -0.5) })"
            >
              −
            </button>
            <input
              class="num w-full min-w-0 bg-transparent text-center text-2xl font-bold outline-none"
              inputmode="decimal"
              aria-label="Velocidad (km/h)"
              [value]="show(entry().speed_kmh)"
              (change)="patch({ speed_kmh: optional($any($event.target).value) })"
            />
            <button
              type="button"
              class="h-14 w-9 shrink-0 text-2xl"
              aria-label="Sumar 0,5 km/h"
              (click)="patch({ speed_kmh: stepHalf(entry().speed_kmh ?? null, 0.5) })"
            >
              +
            </button>
          </div>
        </div>
        <div>
          <span class="eyebrow mb-1.5 block">Incl. %</span>
          <div class="flex items-center rounded-xl border border-border bg-background">
            <button
              type="button"
              class="h-14 w-9 shrink-0 text-2xl"
              aria-label="Restar 0,5 %"
              (click)="patch({ incline_pct: stepHalf(entry().incline_pct ?? null, -0.5) })"
            >
              −
            </button>
            <input
              class="num w-full min-w-0 bg-transparent text-center text-2xl font-bold outline-none"
              inputmode="decimal"
              aria-label="Inclinación (%)"
              [value]="show(entry().incline_pct)"
              (change)="patch({ incline_pct: optional($any($event.target).value) })"
            />
            <button
              type="button"
              class="h-14 w-9 shrink-0 text-2xl"
              aria-label="Sumar 0,5 %"
              (click)="patch({ incline_pct: stepHalf(entry().incline_pct ?? null, 0.5) })"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div class="mt-3 grid grid-cols-3 gap-2">
          <label class="eyebrow flex flex-col gap-1.5"
            >Distancia (km)
            <input
              class="num h-12 rounded-xl border border-border bg-background px-3 text-lg normal-case tracking-normal"
              inputmode="decimal"
              aria-label="Distancia (km)"
              [value]="show(entry().distance_km)"
              (change)="patch({ distance_km: optional($any($event.target).value) })"
            />
          </label>
          <label class="eyebrow flex flex-col gap-1.5"
            >FC prom.
            <input
              class="num h-12 rounded-xl border border-border bg-background px-3 text-lg normal-case tracking-normal"
              inputmode="numeric"
              aria-label="FC promedio"
              [value]="show(entry().avg_heart_rate)"
              (change)="patch({ avg_heart_rate: optionalInt($any($event.target).value) })"
            />
          </label>
          <label class="eyebrow flex flex-col gap-1.5"
            >Calorías
            <input
              class="num h-12 rounded-xl border border-border bg-background px-3 text-lg normal-case tracking-normal"
              inputmode="numeric"
              aria-label="Calorías"
              [value]="show(entry().calories)"
              (change)="patch({ calories: optionalInt($any($event.target).value) })"
            />
          </label>
      </div>

      <div class="mt-3 flex gap-2">
        <button hlmBtn class="num h-14 flex-1 text-xl font-bold tracking-wide uppercase" (click)="save()">
          {{ editingSetId() ? 'Actualizar' : 'Guardar tramo' }}
        </button>
      </div>
      @if (editingSetId()) {
        <button type="button" class="mt-2 text-sm text-muted-foreground underline" (click)="cancelEdit()">
          Cancelar edición
        </button>
      }
    </article>
  `,
})
export class CardioCard {
  private readonly confirm = inject(ConfirmService);
  private readonly sessions = inject(WorkoutSessionService);

  readonly item = input.required<SessionExercise>();
  readonly finished = input(false);
  /** El ejercicio que toca ahora: se resalta con borde lima. */
  readonly current = input(false);

  protected readonly stepMinutes = stepMinutes;
  protected readonly stepHalf = stepHalf;
  protected readonly formatNumber = formatNumber;

  protected readonly entry = linkedSignal<WorkoutSetInput>(() => suggestNextSegment(this.item()));
  protected readonly seconds = computed(() => this.entry().duration_seconds ?? 0);
  protected readonly editingSetId = signal<string | null>(null);
  protected readonly total = computed(() => formatCardioTotal(this.item().sets));

  protected readonly targetLine = computed(() => {
    const ex = this.item();
    return [ex.target_sets !== null ? formatSegments(ex.target_sets) : null, ex.target_text]
      .filter(Boolean)
      .join(' · ');
  });

  protected readonly lastLine = computed(() => {
    const last = this.item().last_performance;
    return last?.sets.length
      ? `Última vez: ${formatCardioTotal(last.sets)} · ${formatDate(last.date)}`
      : 'Sin registros anteriores';
  });

  protected line(set: WorkoutSet): string {
    return formatSegmentLine(set);
  }

  protected show(value: number | null | undefined): string {
    return value == null ? '' : formatNumber(value);
  }

  protected optional(text: string): number | null {
    return text.trim() === '' ? null : parseDecimal(text, 0);
  }

  protected optionalInt(text: string): number | null {
    const value = this.optional(text);
    return value === null ? null : Math.round(value);
  }

  protected setMinutes(text: string): void {
    const minutes = parseDecimal(text, this.seconds() / 60);
    this.patch({ duration_seconds: Math.max(60, Math.round(minutes * 60)) });
  }

  protected patch(changes: Partial<WorkoutSetInput>): void {
    this.entry.update((current) => ({ ...current, ...changes }));
  }

  protected edit(set: WorkoutSet): void {
    this.editingSetId.set(set.id);
    this.entry.set(toSetInput(set));
  }

  protected cancelEdit(): void {
    this.editingSetId.set(null);
    this.entry.set(suggestNextSegment(this.item()));
  }

  protected async save(): Promise<void> {
    const editing = this.editingSetId();
    if (editing) {
      await this.sessions.updateSet(this.item().id, editing, this.entry());
      this.editingSetId.set(null);
      return;
    }
    await this.sessions.addSet(this.item().id, this.entry());
  }

  protected async removeSet(set: WorkoutSet): Promise<void> {
    if (!(await this.confirm.ask({ title: '¿Borrar este tramo?', confirmLabel: 'Borrar', destructive: true }))) return;
    await this.sessions.deleteSet(this.item().id, set.id);
    if (this.editingSetId() === set.id) this.editingSetId.set(null);
  }

  protected async removeExercise(): Promise<void> {
    const ex = this.item();
    const ok = await this.confirm.ask({
      title: `¿Quitar ${ex.exercise.name} de esta sesión?`,
      message: ex.sets.length ? `Se borrarán sus ${ex.sets.length} tramos.` : undefined,
      confirmLabel: 'Quitar',
      destructive: true,
    });
    if (!ok) return;
    await this.sessions.removeExercise(ex.id);
  }
}
