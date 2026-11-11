import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucidePlus } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { ExercisesApi } from '../../core/api/exercises-api';
import type { MuscleGroup } from '../../core/models/exercise';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '../../core/models/labels';
import { filterExercises } from './filter-exercises';
import { LibraryList } from './library-list';

import { AppSkeleton } from '../../shared/ui/app-skeleton';
import { MiniBodyMap } from '../../shared/ui/body-map/mini-body-map';

@Component({
  selector: 'app-exercises-page',
  imports: [RouterLink, NgIcon, HlmButton, HlmInput, AppSkeleton, LibraryList, MiniBodyMap],
  providers: [provideIcons({ lucidePlus, lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-4 flex items-center justify-between">
      <h1 class="page-title">Ejercicios</h1>
      <a hlmBtn routerLink="/ejercicios/nuevo" class="h-12 px-4"><ng-icon name="lucidePlus" /> Nuevo</a>
    </header>

    <nav class="mb-4 grid grid-cols-2 rounded-xl bg-muted p-1" aria-label="Vista de ejercicios">
      <a
        routerLink="/ejercicios"
        class="flex h-11 items-center justify-center rounded-lg text-sm font-semibold"
        [class.bg-background]="!libraryTab()"
        [class.text-muted-foreground]="libraryTab()"
        [attr.aria-current]="libraryTab() ? null : 'page'"
      >
        Mis ejercicios
      </a>
      <a
        routerLink="/ejercicios"
        [queryParams]="{ vista: 'biblioteca' }"
        class="flex h-11 items-center justify-center rounded-lg text-sm font-semibold"
        [class.bg-background]="libraryTab()"
        [class.text-muted-foreground]="!libraryTab()"
        [attr.aria-current]="libraryTab() ? 'page' : null"
      >
        Biblioteca
      </a>
    </nav>

    @if (libraryTab()) {
      <app-library-list />
    } @else {
      <input hlmInput type="search" placeholder="Buscar ejercicio…" class="mb-3 h-12 w-full text-base"
             [value]="search()" (input)="search.set($any($event.target).value)" aria-label="Buscar ejercicio" />

      <div class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button hlmBtn size="sm" class="h-10 shrink-0" [variant]="group() === null ? 'default' : 'outline'"
                (click)="group.set(null)">Todos</button>
        @for (g of groups; track g) {
          <button hlmBtn size="sm" class="h-10 shrink-0" [variant]="group() === g ? 'default' : 'outline'"
                  (click)="group.set(g)">{{ muscleLabels[g] }}</button>
        }
      </div>


      @if (exercises.isLoading()) {
        <app-skeleton variant="list" [rows]="6" />
      } @else if (exercises.error()) {
        <p class="text-destructive">No se pudieron cargar los ejercicios.</p>
      } @else {
        <ul class="divide-y divide-border card">
          @for (exercise of visible(); track exercise.id) {
            <li>
              <a [routerLink]="['/ejercicios', exercise.id]" class="flex min-h-16 items-center gap-3 px-4 py-2">
              <app-mini-body-map [primary]="exercise.muscle_group" [secondaries]="exercise.secondary_muscles" />
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{{ exercise.name }}</span>
                <span class="text-sm text-muted-foreground">
                  {{ muscleLabels[exercise.muscle_group] }} · {{ equipmentLabels[exercise.equipment] }}
                </span>
              </span>
              <ng-icon name="lucideChevronRight" class="shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
            </li>
          } @empty {
            <li class="px-4 py-6 text-center text-muted-foreground">No hay ejercicios que coincidan.</li>
          }
        </ul>
      }
    }
  `,
})
export class ExercisesPage {
  private readonly api = inject(ExercisesApi);

  /** Query param `?vista=biblioteca` (enlazado por el router): la pestaña queda en la URL al volver de una ficha. */
  readonly vista = input<string>();
  protected readonly libraryTab = computed(() => this.vista() === 'biblioteca');

  protected readonly groups = MUSCLE_GROUPS;
  protected readonly muscleLabels = MUSCLE_GROUP_LABELS;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;

  protected readonly search = signal('');
  protected readonly group = signal<MuscleGroup | null>(null);

  protected readonly exercises = resource({
    params: () => (this.libraryTab() ? undefined : {}),
    loader: ({ params }) => this.api.list(params),
  });

  protected readonly visible = computed(() =>
    filterExercises(this.exercises.value() ?? [], this.search(), this.group()),
  );
}
