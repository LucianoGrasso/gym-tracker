import { ChangeDetectionStrategy, Component, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { apiErrorMessage } from '../../core/api/api-error';
import { ExercisesApi } from '../../core/api/exercises-api';
import { formatDate, formatKg } from '../../core/format/format';
import type { Exercise, ExerciseSession } from '../../core/models/exercise';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS, SET_TYPE_LABELS } from '../../core/models/labels';

@Component({
  selector: 'app-exercise-detail-page',
  imports: [RouterLink, HlmBadge, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/ejercicios" class="mb-4 inline-block text-sm text-muted-foreground">← Ejercicios</a>

    @if (exercise.value(); as ex) {
      <header class="mb-4">
        <h1 class="page-title">{{ ex.name }}</h1>
        <p class="text-muted-foreground">
          {{ muscleLabels[ex.muscle_group] }} · {{ equipmentLabels[ex.equipment] }}
          @if (ex.is_unilateral) { · Unilateral }
          @if (ex.uses_bodyweight) { · Peso corporal }
        </p>
        @if (ex.archived_at) { <span hlmBadge variant="secondary" class="mt-2">Archivado</span> }
        @if (ex.notes) { <p class="mt-2 whitespace-pre-line">{{ ex.notes }}</p> }
      </header>

      <div class="mb-6 grid grid-cols-2 gap-3">
        @if (ex.has_history) {
          <a hlmBtn class="col-span-2 h-12" [routerLink]="['/estadisticas/ejercicios', ex.id]">Ver estadísticas</a>
        }
        <a hlmBtn variant="outline" class="h-12" [routerLink]="['/ejercicios', ex.id, 'editar']">Editar</a>
        @if (ex.archived_at) {
          <button hlmBtn variant="outline" class="h-12" (click)="toggleArchive(ex)">Restaurar</button>
        } @else {
          <button hlmBtn variant="outline" class="h-12" (click)="toggleArchive(ex)">Archivar</button>
        }
        @if (!ex.has_history) {
          <button hlmBtn variant="destructive" class="col-span-2 h-12" (click)="remove(ex)">Eliminar</button>
        }
      </div>

      @if (error()) { <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p> }

      <h2 class="mb-2 section-title">Historial</h2>
      @for (session of sessions(); track session.workout_id) {
        <section class="mb-3 card p-3">
          <h3 class="mb-1 font-medium">{{ formatDate(session.date) }}</h3>
          <ul class="text-sm">
            @for (set of session.sets; track set.id) {
              <li>
                {{ set.set_number }}. {{ formatKg(set.weight_kg) }} × {{ set.reps }}
                @if (set.set_type !== 'normal') { <span class="text-muted-foreground">({{ setTypeLabels[set.set_type] }})</span> }
              </li>
            }
          </ul>
        </section>
      } @empty {
        <p class="text-muted-foreground">Todavía no hay series registradas.</p>
      }
      @if (hasMore()) {
        <button hlmBtn variant="outline" class="h-12 w-full" (click)="loadMore()">Cargar más</button>
      }
    } @else if (exercise.error()) {
      <p class="text-destructive">No se encontró el ejercicio.</p>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class ExerciseDetailPage {
  private readonly api = inject(ExercisesApi);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly muscleLabels = MUSCLE_GROUP_LABELS;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly formatKg = formatKg;

  protected readonly error = signal<string | null>(null);
  protected readonly sessions = signal<ExerciseSession[]>([]);
  protected readonly hasMore = signal(false);
  private page = 1;

  protected readonly exercise = resource({
    params: () => Number(this.id()),
    loader: async ({ params: id }) => {
      const [exercise, history] = await Promise.all([this.api.get(id), this.api.history(id, 1)]);
      this.page = 1;
      this.sessions.set(history.data);
      this.hasMore.set(history.meta.current_page < history.meta.last_page);
      return exercise;
    },
  });

  async loadMore(): Promise<void> {
    const history = await this.api.history(Number(this.id()), ++this.page);
    this.sessions.update((list) => [...list, ...history.data]);
    this.hasMore.set(history.meta.current_page < history.meta.last_page);
  }

  async toggleArchive(exercise: Exercise): Promise<void> {
    this.error.set(null);
    try {
      const updated = exercise.archived_at ? await this.api.restore(exercise.id) : await this.api.archive(exercise.id);
      this.exercise.set(updated);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  async remove(exercise: Exercise): Promise<void> {
    if (!confirm(`¿Eliminar "${exercise.name}"? Esta acción no se puede deshacer.`)) return;
    this.error.set(null);
    try {
      await this.api.remove(exercise.id);
      await this.router.navigateByUrl('/ejercicios');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
