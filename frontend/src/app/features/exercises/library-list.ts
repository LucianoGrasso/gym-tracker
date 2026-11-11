import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronRight } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { ExerciseLibraryApi } from '../../core/api/exercise-library-api';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import type { Equipment, MuscleGroup } from '../../core/models/exercise';
import {
  EQUIPMENTS,
  EQUIPMENT_LABELS,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
} from '../../core/models/labels';
import { AppSkeleton } from '../../shared/ui/app-skeleton';
import { MiniBodyMap } from '../../shared/ui/body-map/mini-body-map';
import { filterLibrary } from './filter-exercises';

/** Pestaña "Biblioteca": todos los ejercicios de la app con su esquema muscular. */
@Component({
  selector: 'app-library-list',
  imports: [RouterLink, NgIcon, HlmButton, HlmInput, AppSkeleton, MiniBodyMap],
  providers: [provideIcons({ lucideCheck, lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      hlmInput
      type="search"
      placeholder="Buscar en la biblioteca…"
      class="mb-3 h-12 w-full text-base"
      aria-label="Buscar en la biblioteca"
      [value]="search()"
      (input)="search.set($any($event.target).value)"
    />

    <div class="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Músculo">
      <button
        hlmBtn
        size="sm"
        class="h-10 shrink-0"
        [variant]="group() === null ? 'default' : 'outline'"
        (click)="group.set(null)"
      >
        Todos
      </button>
      @for (g of groups; track g) {
        <button
          hlmBtn
          size="sm"
          class="h-10 shrink-0"
          [variant]="group() === g ? 'default' : 'outline'"
          (click)="group.set(g)"
        >
          {{ muscleLabels[g] }}
        </button>
      }
    </div>
    <div class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Equipo">
      @for (e of equipments; track e) {
        <button
          hlmBtn
          size="sm"
          class="h-9 shrink-0"
          [variant]="equipment() === e ? 'default' : 'ghost'"
          (click)="equipment.set(equipment() === e ? null : e)"
        >
          {{ equipmentLabels[e] }}
        </button>
      }
    </div>

    @if (library.error()) {
      <p class="text-destructive">No se pudo cargar la biblioteca.</p>
    } @else if (library.hasValue()) {
      <p class="mb-2 text-sm text-muted-foreground">{{ visible().length }} ejercicios</p>
      <ul class="card divide-y divide-border">
        @for (exercise of visible(); track exercise.slug) {
          <li>
            <a
              [routerLink]="['/ejercicios/biblioteca', exercise.slug]"
              class="flex min-h-16 items-center gap-3 px-4 py-2"
            >
              <app-mini-body-map
                [primary]="exercise.muscle_group"
                [secondaries]="exercise.secondary_muscles"
              />
              <span class="min-w-0 flex-1">
                <span data-name class="block font-medium">{{ exercise.name }}</span>
                <span class="text-sm text-muted-foreground">
                  {{ muscleLabels[exercise.muscle_group] }} ·
                  {{ equipmentLabels[exercise.equipment] }}
                </span>
              </span>
              @if (exercise.owned_exercise_id) {
                <span
                  data-owned
                  class="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary"
                >
                  <ng-icon name="lucideCheck" size="16" aria-hidden="true" /> Lo usas
                </span>
              }
              <ng-icon
                name="lucideChevronRight"
                class="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </a>
          </li>
        } @empty {
          <li class="px-4 py-6 text-center text-muted-foreground">
            No hay ejercicios que coincidan.
          </li>
        }
      </ul>
    } @else {
      <app-skeleton variant="list" [rows]="6" />
    }
  `,
})
export class LibraryList {
  private readonly api = inject(ExerciseLibraryApi);
  private readonly db = inject(LOCAL_DB);

  protected readonly groups = MUSCLE_GROUPS;
  protected readonly equipments = EQUIPMENTS;
  protected readonly muscleLabels = MUSCLE_GROUP_LABELS;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;

  protected readonly search = signal('');
  protected readonly group = signal<MuscleGroup | null>(null);
  protected readonly equipment = signal<Equipment | null>(null);

  protected readonly library = resource({
    loader: () => cachedFetch(this.db, 'exercise-library', () => this.api.list()),
  });

  protected readonly visible = computed(() =>
    this.library.hasValue()
      ? filterLibrary(this.library.value(), this.search(), this.group(), this.equipment())
      : [],
  );
}
