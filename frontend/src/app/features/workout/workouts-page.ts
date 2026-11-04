import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { apiErrorMessage } from '../../core/api/api-error';
import { WorkoutsApi } from '../../core/api/workouts-api';
import { formatDate } from '../../core/format/format';
import type { WorkoutSummary } from '../../core/models/workout';

/** Historial de sesiones sincronizadas, de la más reciente a la más antigua. */
@Component({
  selector: 'app-workouts-page',
  imports: [RouterLink, NgIcon, HlmButton],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-4 flex items-center gap-3">
      <a
        routerLink="/hoy"
        class="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card"
        aria-label="Volver a Hoy"
      >
        <ng-icon name="lucideChevronLeft" size="22" />
      </a>
      <h1 class="page-title">Entrenamientos</h1>
    </header>

    @if (error()) {
      <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p>
    }

    <ul class="flex flex-col gap-2">
      @for (w of workouts(); track w.id) {
        <li>
          <a [routerLink]="['/entrenamiento', w.id]" class="card flex items-center gap-3 p-4">
            <div class="min-w-0 flex-1">
              <p class="eyebrow">
                {{ formatDate(w.date) }}
                @if (!w.finished_at) {
                  · <span class="text-amber-300">sin terminar</span>
                }
              </p>
              <p class="truncate text-lg font-semibold">{{ w.routine_day_name ?? 'Sesión libre' }}</p>
              <p class="num text-base text-muted-foreground">
                {{ w.exercises_count }} ejercicios · {{ w.sets_count }} series
              </p>
            </div>
            <ng-icon name="lucideChevronRight" size="20" class="text-muted-foreground" />
          </a>
        </li>
      } @empty {
        @if (!loading()) {
          <li class="text-muted-foreground">Todavía no hay entrenamientos sincronizados.</li>
        }
      }
    </ul>

    @if (hasMore()) {
      <button hlmBtn variant="outline" class="mt-4 h-12 w-full" [disabled]="loading()" (click)="load()">
        Cargar más
      </button>
    }
  `,
})
export class WorkoutsPage {
  private readonly api = inject(WorkoutsApi);

  protected readonly formatDate = formatDate;
  protected readonly workouts = signal<WorkoutSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly error = signal<string | null>(null);
  private page = 0;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.list(this.page + 1);
      this.page = result.meta.current_page;
      this.workouts.update((list) => [...list, ...result.data]);
      this.hasMore.set(result.meta.current_page < result.meta.last_page);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
