import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { apiErrorMessage } from '../../core/api/api-error';
import { ExerciseLibraryApi } from '../../core/api/exercise-library-api';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import { EQUIPMENT_LABELS } from '../../core/models/labels';
import { exerciseIntensities, formatMuscles } from '../../core/stats/muscle-sets';
import { AppSkeleton } from '../../shared/ui/app-skeleton';
import { BodyMap } from '../../shared/ui/body-map/body-map';

/** Ficha de un ejercicio de la biblioteca: qué músculos trabaja y cómo pasarlo a "Mis ejercicios". */
@Component({
  selector: 'app-library-detail-page',
  imports: [RouterLink, HlmButton, AppSkeleton, BodyMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/ejercicios" [queryParams]="{ vista: 'biblioteca' }" class="mb-4 inline-block text-sm text-muted-foreground">
      ← Biblioteca
    </a>

    @if (library.error()) {
      <p class="text-destructive">No se pudo cargar la biblioteca.</p>
    } @else if (library.hasValue()) {
      @if (exercise(); as ex) {
        <header class="mb-4">
          <h1 class="page-title">{{ ex.name }}</h1>
          <p class="text-muted-foreground">
            {{ equipmentLabels[ex.equipment] }}
            @if (ex.is_unilateral) { · Unilateral }
            @if (ex.uses_bodyweight) { · Peso corporal }
          </p>
        </header>

        <section class="card mb-6 p-4">
          <app-body-map [intensities]="intensities()" />
          <p class="mt-3 text-center">{{ muscles() }}</p>
          <p class="mt-1 text-center text-sm text-muted-foreground">Los secundarios cuentan media serie en tus estadísticas.</p>
        </section>

        @if (ex.owned_exercise_id) {
          <a hlmBtn class="h-12 w-full" [routerLink]="['/ejercicios', ex.owned_exercise_id]">Ver mi ejercicio</a>
        } @else {
          <button hlmBtn class="h-12 w-full" [disabled]="adding()" (click)="adopt(ex.slug)">Agregar a mis ejercicios</button>
        }
        @if (error()) {
          <p class="mt-3 text-sm text-destructive" role="alert">{{ error() }}</p>
        }
      } @else {
        <p class="text-muted-foreground">Ese ejercicio no está en la biblioteca.</p>
      }
    } @else {
      <app-skeleton variant="page" />
    }
  `,
})
export class LibraryDetailPage {
  private readonly api = inject(ExerciseLibraryApi);
  private readonly db = inject(LOCAL_DB);
  private readonly router = inject(Router);

  readonly slug = input.required<string>();

  protected readonly equipmentLabels = EQUIPMENT_LABELS;
  protected readonly adding = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly library = resource({
    loader: () => cachedFetch(this.db, 'exercise-library', () => this.api.list()),
  });
  protected readonly exercise = computed(() =>
    this.library.hasValue() ? (this.library.value().find((e) => e.slug === this.slug()) ?? null) : null,
  );
  protected readonly intensities = computed(() => {
    const ex = this.exercise();
    return ex ? exerciseIntensities(ex.muscle_group, ex.secondary_muscles) : {};
  });
  protected readonly muscles = computed(() => {
    const ex = this.exercise();
    return ex ? formatMuscles(ex.muscle_group, ex.secondary_muscles) : '';
  });

  protected async adopt(slug: string): Promise<void> {
    this.adding.set(true);
    this.error.set(null);
    try {
      const exercise = await this.api.adopt(slug);
      await this.router.navigate(['/ejercicios', exercise.id]);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.adding.set(false);
    }
  }
}
