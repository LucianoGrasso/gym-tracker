import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucidePlus } from '@ng-icons/lucide';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { ExercisesApi } from '../../core/api/exercises-api';
import type { MuscleGroup } from '../../core/models/exercise';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '../../core/models/labels';
import { filterExercises } from './filter-exercises';

@Component({
  selector: 'app-exercises-page',
  imports: [RouterLink, NgIcon, HlmBadge, HlmButton, HlmInput],
  providers: [provideIcons({ lucidePlus, lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-4 flex items-center justify-between">
      <h1 class="page-title">Ejercicios</h1>
      <a hlmBtn routerLink="/ejercicios/nuevo" class="h-12 px-4"><ng-icon name="lucidePlus" /> Nuevo</a>
    </header>

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

    <label class="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" class="size-5" [checked]="archived()" (change)="archived.set(!archived())" />
      Ver archivados
    </label>

    @if (exercises.isLoading()) {
      <p class="text-muted-foreground">Cargando…</p>
    } @else if (exercises.error()) {
      <p class="text-destructive">No se pudieron cargar los ejercicios.</p>
    } @else {
      <ul class="divide-y divide-border card">
        @for (exercise of visible(); track exercise.id) {
          <li>
            <a [routerLink]="['/ejercicios', exercise.id]" class="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <span>
                <span class="block font-medium">{{ exercise.name }}</span>
                <span class="text-sm text-muted-foreground">
                  {{ muscleLabels[exercise.muscle_group] }} · {{ equipmentLabels[exercise.equipment] }}
                </span>
              </span>
              <span class="flex items-center gap-2">
                @if (exercise.archived_at) { <span hlmBadge variant="secondary">Archivado</span> }
                <ng-icon name="lucideChevronRight" class="text-muted-foreground" />
              </span>
            </a>
          </li>
        } @empty {
          <li class="px-4 py-6 text-center text-muted-foreground">No hay ejercicios que coincidan.</li>
        }
      </ul>
    }
  `,
})
export class ExercisesPage {
  private readonly api = inject(ExercisesApi);

  protected readonly groups = MUSCLE_GROUPS;
  protected readonly muscleLabels = MUSCLE_GROUP_LABELS;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;

  protected readonly search = signal('');
  protected readonly group = signal<MuscleGroup | null>(null);
  protected readonly archived = signal(false);

  protected readonly exercises = resource({
    params: () => ({ archived: this.archived() }),
    loader: ({ params }) => this.api.list(params),
  });

  protected readonly visible = computed(() =>
    filterExercises(this.exercises.value() ?? [], this.search(), this.group()),
  );
}
