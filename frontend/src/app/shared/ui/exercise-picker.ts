import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  output,
  resource,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import { HlmInput } from '@spartan-ng/helm/input';
import { ExerciseLibraryApi } from '../../core/api/exercise-library-api';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import type { Exercise, MuscleGroup } from '../../core/models/exercise';
import { MUSCLE_GROUP_LABELS, MUSCLE_REGION_LABELS } from '../../core/models/labels';
import type { LibraryExercise } from '../../core/models/library';

/** Minúsculas y sin tildes: "Tríceps" y "triceps" coinciden. */
const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function describe(name: string, muscle: MuscleGroup): { group: string; haystack: string } {
  const group = MUSCLE_GROUP_LABELS[muscle];
  const region = MUSCLE_REGION_LABELS[muscle] ?? '';
  return { group, haystack: normalize(`${name} ${group} ${region}`) };
}

/**
 * Buscador de ejercicios: se escribe para filtrar (por nombre o grupo muscular) y se toca uno.
 * Reemplaza al <select> nativo, incómodo de recorrer con decenas de ejercicios.
 */
@Component({
  selector: 'app-exercise-picker',
  imports: [HlmInput, NgIcon],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (chosen(); as picked) {
      <div class="picked set-saved flex min-h-14 items-center gap-3 rounded-md border-2 border-primary bg-primary/10 px-3 py-2">
        <ng-icon name="lucideCheck" size="22" class="shrink-0 text-primary" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="text-base font-semibold leading-tight">{{ picked.exercise.name }}</p>
          <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ picked.group }}</p>
        </div>
        <button type="button" class="h-12 shrink-0 px-2 text-sm font-semibold text-primary underline" (click)="reopen()">
          Cambiar
        </button>
      </div>
    } @else {
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
            (click)="pick(item.exercise.id)"
          >
            <span class="name text-base">{{ item.exercise.name }}</span>
            <span
              class="shrink-0 text-xs uppercase tracking-wide"
              [class.text-muted-foreground]="item.exercise.id !== value()"
              >{{ item.group }}</span
            >
          </button>
        } @empty {
          @if (!libraryMatches().length) {
            <p class="px-3 py-4 text-sm text-muted-foreground">
              Sin resultados para «{{ query() }}».
            </p>
          }
        }
        @if (libraryMatches().length) {
          <p class="sticky top-0 border-b border-border bg-card px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Biblioteca
          </p>
          @for (item of libraryMatches(); track item.exercise.slug) {
            <button
              type="button"
              role="option"
              data-library
              class="flex min-h-12 w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 disabled:opacity-50"
              [attr.aria-selected]="false"
              [disabled]="adopting() !== null"
              (click)="adopt(item.exercise)"
            >
              <span class="name text-base">{{ item.exercise.name }}</span>
              <span class="shrink-0 text-xs tracking-wide text-muted-foreground uppercase">
                {{ adopting() === item.exercise.slug ? 'Agregando…' : item.group }}
              </span>
            </button>
          }
        }
      </div>
      @if (adoptError()) {
        <p class="text-sm text-destructive" role="alert">{{ adoptError() }}</p>
      }
    </div>
    }
  `,
})
export class ExercisePicker {
  readonly exercises = input.required<readonly Exercise[]>();
  readonly value = model<number | null>(null);
  readonly label = input('Ejercicio');
  /** Muestra también la biblioteca (rutinas y entrenamientos); al elegir uno pasa a "Mis ejercicios". */
  readonly withLibrary = input(false);
  /** Ejercicio de la biblioteca recién agregado a "Mis ejercicios": el padre lo suma a su lista. */
  readonly adopted = output<Exercise>();

  // La API y la base local se piden solo con biblioteca: así el buscador no depende de HttpClient.
  private readonly injector = inject(Injector);
  private readonly library = resource({
    params: () => (this.withLibrary() ? true : undefined),
    loader: () =>
      cachedFetch(this.injector.get(LOCAL_DB), 'exercise-library', () => this.injector.get(ExerciseLibraryApi).list()),
  });
  /** Agregados desde la biblioteca en esta pantalla (hasta que el padre recargue su lista). */
  private readonly added = signal<Exercise[]>([]);
  protected readonly adopting = signal<string | null>(null);
  protected readonly adoptError = signal<string | null>(null);

  protected readonly query = signal('');
  /** Buscando: sin elección, o tras tocar "Cambiar". Al elegir se cierra y queda el ejercicio a la vista. */
  private readonly searching = linkedSignal(() => this.value() === null);

  private readonly indexed = computed(() => {
    const own = this.exercises();
    const ids = new Set(own.map((e) => e.id));
    return [...own, ...this.added().filter((e) => !ids.has(e.id))].map((exercise) => ({
      exercise,
      ...describe(exercise.name, exercise.muscle_group),
    }));
  });

  /** Biblioteca sin los que ya son míos (por id o por nombre). */
  private readonly libraryIndexed = computed(() => {
    if (!this.withLibrary() || !this.library.hasValue()) return [];
    const ownNames = new Set(this.indexed().map((item) => normalize(item.exercise.name)));
    return this.library
      .value()
      .filter((e) => e.owned_exercise_id === null && !ownNames.has(normalize(e.name)))
      .map((exercise) => ({ exercise, ...describe(exercise.name, exercise.muscle_group) }));
  });

  protected readonly chosen = computed(() =>
    this.searching() ? null : (this.indexed().find((item) => item.exercise.id === this.value()) ?? null),
  );

  protected pick(id: number): void {
    this.value.set(id);
    this.searching.set(false);
  }

  protected reopen(): void {
    this.query.set('');
    this.searching.set(true);
  }

  /** Cada palabra escrita debe aparecer en el nombre o el grupo muscular. */
  private readonly words = computed(() => normalize(this.query()).split(/\s+/).filter(Boolean));
  protected readonly matches = computed(() =>
    this.indexed().filter((item) => this.words().every((word) => item.haystack.includes(word))),
  );
  protected readonly libraryMatches = computed(() =>
    this.libraryIndexed().filter((item) => this.words().every((word) => item.haystack.includes(word))),
  );

  protected async adopt(exercise: LibraryExercise): Promise<void> {
    this.adopting.set(exercise.slug);
    this.adoptError.set(null);
    try {
      const own = await this.injector.get(ExerciseLibraryApi).adopt(exercise.slug);
      this.added.update((list) => [...list, own]);
      this.adopted.emit(own);
      this.pick(own.id);
    } catch {
      this.adoptError.set('Necesitas conexión para agregar un ejercicio nuevo de la biblioteca.');
    } finally {
      this.adopting.set(null);
    }
  }
}
