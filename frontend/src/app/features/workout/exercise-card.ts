import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideTrash2, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { formatDate } from '../../core/format/format';
import { formatBestSet, formatRest, formatTargets } from '../../core/format/training';
import type { WorkoutSet } from '../../core/models/exercise';
import { SET_TYPES, SET_TYPE_LABELS } from '../../core/models/labels';
import type { SessionExercise, WorkoutSetInput } from '../../core/models/workout';
import { RestTimerService, restNoticeBody } from '../../core/workout/rest-timer.service';
import {
  bilboHint,
  formatNumber,
  formatSetLine,
  isWarmup,
  parseDecimal,
  restAfter,
  setNumberLabels,
  stepReps,
  stepWeight,
  suggestNextSet,
  toSetInput,
  workingSets,
} from '../../core/workout/set-suggestions';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { SELECT_CLASS } from '../../shared/ui/form-styles';

/** Tarjeta de un ejercicio de la sesión: series hechas + stepper para la próxima. */
@Component({
  selector: 'app-exercise-card',
  imports: [NgIcon, HlmButton, HlmInput],
  providers: [provideIcons({ lucideCheck, lucideTrash2, lucideX })],
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
          @if (hint().target) {
            <p class="text-sm font-semibold text-primary">
              Objetivo Bilbo: {{ hint().target }} reps
            </p>
          }
          @if (hint().suggestIncrease) {
            <p class="text-sm font-semibold text-primary">
              35+ reps limpias: sube 2,5-5 kg y vuelve a ~30.
            </p>
          }
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
        <ol class="mb-4 flex flex-col gap-1.5">
          @for (set of ex.sets; track set.id; let i = $index) {
            <li
              class="flex min-h-12 items-center rounded-xl bg-muted pl-3"
              [class.opacity-60]="isWarmup(set)"
              [class.set-saved]="lastSavedId() === set.id"
              [class.ring-2]="editingSetId() === set.id"
              [class.ring-primary]="editingSetId() === set.id"
            >
              <button
                type="button"
                class="num flex flex-1 items-center gap-3 py-2 text-left"
                (click)="edit(set)"
              >
                <span class="set-number w-5 text-base text-muted-foreground">{{
                  numberLabels()[i]
                }}</span>
                <span class="text-xl font-semibold">{{ setLine(set) }}</span>
                @if (lastSavedId() === set.id) {
                  <ng-icon name="lucideCheck" size="20" class="set-check text-primary" aria-hidden="true" />
                }
              </button>
              <button
                hlmBtn
                variant="ghost"
                size="icon-lg"
                class="text-muted-foreground"
                (click)="removeSet(set)"
                aria-label="Borrar serie"
              >
                <ng-icon name="lucideX" />
              </button>
            </li>
          }
        </ol>
      }

      <div class="grid grid-cols-2 gap-3">
        <div>
          <span class="eyebrow mb-1.5 block">{{
            ex.exercise.uses_bodyweight ? 'Peso extra (kg)' : 'Peso (kg)'
          }}</span>
          <div class="flex items-center rounded-xl border border-border bg-background">
            <button
              type="button"
              class="h-14 w-12 shrink-0 text-2xl"
              (click)="patch({ weight_kg: stepWeight(entry().weight_kg, -2.5) })"
              aria-label="Restar 2,5 kg"
            >
              −
            </button>
            <input
              class="num w-full min-w-0 bg-transparent text-center text-3xl font-bold outline-none"
              inputmode="decimal"
              aria-label="Peso"
              [value]="formatNumber(entry().weight_kg)"
              (change)="
                patch({ weight_kg: parseDecimal($any($event.target).value, entry().weight_kg) })
              "
            />
            <button
              type="button"
              class="h-14 w-12 shrink-0 text-2xl"
              (click)="patch({ weight_kg: stepWeight(entry().weight_kg, 2.5) })"
              aria-label="Sumar 2,5 kg"
            >
              +
            </button>
          </div>
        </div>
        <div>
          <span class="eyebrow mb-1.5 block">Reps</span>
          <div class="flex items-center rounded-xl border border-border bg-background">
            <button
              type="button"
              class="h-14 w-12 shrink-0 text-2xl"
              (click)="patch({ reps: stepReps(entry().reps, -1) })"
              aria-label="Restar 1 rep"
            >
              −
            </button>
            <input
              class="num w-full min-w-0 bg-transparent text-center text-3xl font-bold outline-none"
              inputmode="numeric"
              aria-label="Repeticiones"
              [value]="entry().reps"
              (change)="
                patch({ reps: Math.round(parseDecimal($any($event.target).value, entry().reps)) })
              "
            />
            <button
              type="button"
              class="h-14 w-12 shrink-0 text-2xl"
              (click)="patch({ reps: stepReps(entry().reps, 1) })"
              aria-label="Sumar 1 rep"
            >
              +
            </button>
          </div>
        </div>
      </div>

      @if (showMore()) {
        <div class="mt-3 grid grid-cols-2 gap-3">
          <label class="eyebrow flex flex-col gap-1.5"
            >Tipo
            <select
              [class]="selectClass"
              [value]="entry().set_type"
              (change)="patch({ set_type: $any($event.target).value })"
            >
              @for (type of setTypes; track type) {
                <option [value]="type">{{ setTypeLabels[type] }}</option>
              }
            </select>
          </label>
          <label class="eyebrow flex flex-col gap-1.5"
            >Lado
            <select
              [class]="selectClass"
              [value]="entry().side"
              (change)="patch({ side: $any($event.target).value })"
            >
              <option value="both">Ambos</option>
              <option value="left">Izquierdo</option>
              <option value="right">Derecho</option>
            </select>
          </label>
          <label class="eyebrow flex flex-col gap-1.5"
            >RIR
            <select
              [class]="selectClass"
              [value]="entry().rir ?? ''"
              (change)="patch({ rir: toNullableInt($any($event.target).value) })"
            >
              <option value="">—</option>
              @for (n of zeroToFive; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>
          </label>
          <label class="eyebrow flex flex-col gap-1.5"
            >Molestia (0-10)
            <select
              [class]="selectClass"
              [value]="entry().pain_level ?? ''"
              (change)="patch({ pain_level: toNullableInt($any($event.target).value) })"
            >
              <option value="">—</option>
              @for (n of zeroToTen; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>
          </label>
          <label class="eyebrow col-span-2 flex flex-col gap-1.5"
            >Nota
            <input
              hlmInput
              class="h-12 text-base normal-case tracking-normal"
              [value]="entry().notes ?? ''"
              (change)="patch({ notes: $any($event.target).value || null })"
            />
          </label>
        </div>
      }

      <button
        type="button"
        class="mt-3 h-12 rounded-full border px-4 text-base font-semibold tracking-wide uppercase"
        [attr.aria-pressed]="warmup()"
        [class.bg-primary]="warmup()"
        [class.border-primary]="warmup()"
        [class.text-primary-foreground]="warmup()"
        [class.border-border]="!warmup()"
        [class.text-muted-foreground]="!warmup()"
        (click)="toggleWarmup()"
      >
        Calentamiento
      </button>

      <div class="mt-3 flex gap-2">
        <button hlmBtn variant="ghost" class="h-14" (click)="showMore.set(!showMore())">
          {{ showMore() ? 'Menos' : 'Más' }}
        </button>
        <button
          hlmBtn
          variant="outline"
          class="h-14"
          (click)="copyPrevious()"
          [disabled]="!ex.sets.length"
        >
          Copiar anterior
        </button>
        <button
          hlmBtn
          class="num h-14 flex-1 text-xl font-bold tracking-wide uppercase"
          (click)="save()"
        >
          {{ savedFlash() ? '✓ Guardada' : editingSetId() ? 'Actualizar' : 'Guardar serie' }}
        </button>
      </div>
      @if (editingSetId()) {
        <button
          type="button"
          class="mt-2 text-sm text-muted-foreground underline"
          (click)="cancelEdit()"
        >
          Cancelar edición
        </button>
      }
    </article>
  `,
})
export class ExerciseCard {
  private readonly sessions = inject(WorkoutSessionService);
  private readonly timer = inject(RestTimerService);

  readonly item = input.required<SessionExercise>();
  readonly finished = input(false);
  /** El ejercicio que toca ahora: se resalta con borde lima. */
  readonly current = input(false);

  protected readonly Math = Math;
  protected readonly selectClass = SELECT_CLASS;
  protected readonly setTypes = SET_TYPES;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly zeroToFive = [0, 1, 2, 3, 4, 5];
  protected readonly zeroToTen = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  protected readonly stepWeight = stepWeight;
  protected readonly stepReps = stepReps;
  protected readonly parseDecimal = parseDecimal;
  protected readonly formatNumber = formatNumber;

  protected readonly entry = linkedSignal<WorkoutSetInput>(() => suggestNextSet(this.item()));
  /** Serie recién guardada: su fila destella y muestra un check. */
  protected readonly lastSavedId = signal<string | null>(null);
  protected readonly savedFlash = signal(false);
  private flashHandle: ReturnType<typeof setTimeout> | undefined;
  protected readonly editingSetId = signal<string | null>(null);
  protected readonly showMore = signal(false);
  protected readonly hint = computed(() => bilboHint(this.item()));
  protected readonly isWarmup = isWarmup;
  protected readonly numberLabels = computed(() => setNumberLabels(this.item().sets));
  protected readonly warmup = computed(() => isWarmup(this.entry()));

  protected readonly targetLine = computed(() => {
    const ex = this.item();
    const parts = [
      ex.target_sets !== null ? formatTargets({ ...ex, target_sets: ex.target_sets }) : null,
      ex.target_text,
      `descanso ${formatRest(ex.rest_seconds)}`,
    ];
    return parts.filter(Boolean).join(' · ');
  });

  protected readonly lastLine = computed(() => {
    const ex = this.item();
    const last = ex.last_performance;
    const best = last ? formatBestSet(last.sets, ex.exercise.uses_bodyweight) : null;
    return last && best
      ? `Última vez: ${best} · ${formatDate(last.date)}`
      : 'Sin registros anteriores';
  });

  protected setLine(set: WorkoutSet): string {
    return formatSetLine(set, this.item().exercise.uses_bodyweight);
  }

  protected patch(changes: Partial<WorkoutSetInput>): void {
    this.entry.update((current) => ({ ...current, ...changes }));
  }

  protected toggleWarmup(): void {
    this.patch({ set_type: this.warmup() ? this.item().default_set_type : 'warmup' });
  }

  protected toNullableInt(value: string): number | null {
    return value === '' ? null : Number(value);
  }

  protected copyPrevious(): void {
    const last = this.item().sets.at(-1);
    if (last) this.entry.set(toSetInput(last));
  }

  protected edit(set: WorkoutSet): void {
    this.editingSetId.set(set.id);
    this.entry.set(toSetInput(set));
  }

  protected cancelEdit(): void {
    this.editingSetId.set(null);
    this.entry.set(suggestNextSet(this.item()));
  }

  protected async save(): Promise<void> {
    const input = this.entry();
    const editing = this.editingSetId();
    if (editing) {
      await this.sessions.updateSet(this.item().id, editing, input);
      this.editingSetId.set(null);
      this.celebrate(editing);
      return;
    }
    const workingBefore = workingSets(this.item().sets).length;
    const saved = await this.sessions.addSet(this.item().id, input);
    this.celebrate(saved?.id ?? null);
    if (!this.finished()) {
      const ex = this.item();
      // La próxima efectiva: tras un calentamiento sigue siendo la misma.
      const next = workingBefore + (isWarmup(input) ? 0 : 1) + 1;
      const sessionId = this.sessions.session()?.id;
      this.timer.start(
        restAfter(input, ex.rest_seconds),
        sessionId
          ? { body: restNoticeBody(ex.exercise.name, next, ex.target_sets), url: `/entrenamiento/${sessionId}` }
          : undefined,
      );
    }
  }

  /** Destello en la fila guardada y "✓ Guardada" en el botón por un momento. */
  private celebrate(setId: string | null): void {
    this.lastSavedId.set(setId);
    this.savedFlash.set(true);
    clearTimeout(this.flashHandle);
    this.flashHandle = setTimeout(() => this.savedFlash.set(false), 1200);
  }

  protected async removeSet(set: WorkoutSet): Promise<void> {
    if (!confirm('¿Borrar esta serie?')) return;
    await this.sessions.deleteSet(this.item().id, set.id);
    if (this.editingSetId() === set.id) this.editingSetId.set(null);
  }

  protected async removeExercise(): Promise<void> {
    const ex = this.item();
    const warning = ex.sets.length ? ` Se borrarán sus ${ex.sets.length} series.` : '';
    if (!confirm(`¿Quitar ${ex.exercise.name} de esta sesión?${warning}`)) return;
    await this.sessions.removeExercise(ex.id);
  }
}
