import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { HlmInput } from '@spartan-ng/helm/input';
import type { Exercise } from '../../core/models/exercise';
import { MUSCLE_GROUP_LABELS } from '../../core/models/labels';

/** Minúsculas y sin tildes: "Tríceps" y "triceps" coinciden. */
const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Buscador de ejercicios: se escribe para filtrar (por nombre o grupo muscular) y se toca uno.
 * Reemplaza al <select> nativo, incómodo de recorrer con decenas de ejercicios.
 */
@Component({
  selector: 'app-exercise-picker',
  imports: [HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <input
        hlmInput
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        class="h-12 text-base"
        placeholder="Buscar ejercicio o músculo…"
        [attr.aria-label]="label()"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
      <div
        role="listbox"
        [attr.aria-label]="label()"
        class="max-h-72 overflow-y-auto rounded-md border border-border"
      >
        @for (item of matches(); track item.exercise.id) {
          <button
            type="button"
            role="option"
            class="flex min-h-12 w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0"
            [attr.aria-selected]="item.exercise.id === value()"
            [class.bg-primary]="item.exercise.id === value()"
            [class.text-primary-foreground]="item.exercise.id === value()"
            (click)="value.set(item.exercise.id)"
          >
            <span class="name text-base">{{ item.exercise.name }}</span>
            <span
              class="shrink-0 text-xs uppercase tracking-wide"
              [class.text-muted-foreground]="item.exercise.id !== value()"
              >{{ item.group }}</span
            >
          </button>
        } @empty {
          <p class="px-3 py-4 text-sm text-muted-foreground">
            Sin resultados para «{{ query() }}».
          </p>
        }
      </div>
    </div>
  `,
})
export class ExercisePicker {
  readonly exercises = input.required<readonly Exercise[]>();
  readonly value = model<number | null>(null);
  readonly label = input('Ejercicio');

  protected readonly query = signal('');

  private readonly indexed = computed(() =>
    this.exercises().map((exercise) => {
      const group = MUSCLE_GROUP_LABELS[exercise.muscle_group];
      return { exercise, group, haystack: normalize(`${exercise.name} ${group}`) };
    }),
  );

  /** Cada palabra escrita debe aparecer en el nombre o el grupo muscular. */
  protected readonly matches = computed(() => {
    const words = normalize(this.query()).split(/\s+/).filter(Boolean);
    return this.indexed().filter((item) => words.every((word) => item.haystack.includes(word)));
  });
}
