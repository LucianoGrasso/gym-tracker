import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '../../core/api/api-error';
import { ExercisesApi } from '../../core/api/exercises-api';
import { formatDate } from '../../core/format/format';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import type { Exercise } from '../../core/models/exercise';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import { isPending, parseDecimal } from '../../core/workout/set-suggestions';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { ExercisePicker } from '../../shared/ui/exercise-picker';
import { ExerciseCard } from './exercise-card';


import { AppSkeleton } from '../../shared/ui/app-skeleton';

@Component({
  selector: 'app-workout-page',
  imports: [RouterLink, NgIcon, HlmButton, HlmInput, ExerciseCard, AppSkeleton, ExercisePicker],
  providers: [provideIcons({ lucideChevronLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session(); as s) {
      <header class="mb-4 flex items-center gap-3">
        <a
          routerLink="/hoy"
          class="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card"
          aria-label="Volver a Hoy"
        >
          <ng-icon name="lucideChevronLeft" size="22" />
        </a>
        <div class="min-w-0">
          <p class="eyebrow">
            {{ formatDate(s.date) }} · {{ isActive() ? 'En curso' : 'Terminada' }}
          </p>
          <h1 class="page-title truncate">{{ s.name }}</h1>
        </div>
      </header>

      @if (error()) {
        <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p>
      }

      <div class="flex flex-col gap-3">
        @for (item of s.exercises; track item.id) {
          <app-exercise-card
            [item]="item"
            [finished]="!isActive()"
            [current]="item.id === currentId()"
          />
        } @empty {
          <p class="text-muted-foreground">Agrega un ejercicio para empezar.</p>
        }
      </div>

      <section class="mt-4">
        @if (picking()) {
          <app-exercise-picker
            [exercises]="available()"
            [(value)]="picked"
            [withLibrary]="true"
            (adopted)="adopted($event)"
            label="Ejercicio a agregar"
          />
          <button hlmBtn class="mt-2 h-12 w-full" [disabled]="picked() === null" (click)="addExercise(picked())">
            Agregar
          </button>
          <button
            type="button"
            class="mt-2 text-sm text-muted-foreground underline"
            (click)="picking.set(false)"
          >
            Cancelar
          </button>
        } @else {
          <button hlmBtn variant="outline" class="h-12 w-full" (click)="startPicking()">
            Agregar ejercicio
          </button>
        }
      </section>

      @if (isActive()) {
        <section class="card mt-8 p-4">
          <label class="eyebrow mb-3 flex flex-col gap-1.5"
            >Peso corporal hoy (opcional, kg)
            <input
              hlmInput
              class="num h-12 text-xl normal-case tracking-normal"
              inputmode="decimal"
              #bw
              placeholder="Ej.: 78,5"
            />
          </label>
          <button
            hlmBtn
            variant="outline"
            class="h-14 w-full text-base font-semibold"
            (click)="finish(bw.value)"
          >
            Terminar entrenamiento
          </button>
        </section>
      }

      <div class="mt-6 flex flex-col gap-2">
        <a hlmBtn variant="ghost" class="h-12" routerLink="/entrenamientos"
          >Ver entrenamientos anteriores</a
        >
        <button hlmBtn variant="ghost" class="h-12 text-destructive" (click)="remove()">
          Eliminar entrenamiento
        </button>
      </div>
    } @else if (error()) {
      <p class="text-destructive">{{ error() }}</p>
    } @else {
      <app-skeleton variant="page" />
    }
  `,
})
export class WorkoutPage implements OnInit {
  private readonly sessions = inject(WorkoutSessionService);
  private readonly timer = inject(RestTimerService);
  private readonly exercisesApi = inject(ExercisesApi);
  private readonly db = inject(LOCAL_DB);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly formatDate = formatDate;
  protected readonly session = this.sessions.session;
  protected readonly isActive = computed(() => this.session()?.id === this.sessions.activeId());
  /** El primer ejercicio pendiente de la sesión en curso. */
  protected readonly currentId = computed(() =>
    this.isActive() ? (this.session()?.exercises.find(isPending)?.id ?? null) : null,
  );
  protected readonly error = signal<string | null>(null);
  protected readonly picking = signal(false);
  protected readonly picked = signal<number | null>(null);
  private readonly exercises = signal<Exercise[]>([]);
  protected readonly available = computed(() => {
    const used = new Set(this.session()?.exercises.map((e) => e.exercise.id));
    return this.exercises().filter((e) => !used.has(e.id));
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.sessions.open(this.id());
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected async startPicking(): Promise<void> {
    try {
      this.exercises.set(await cachedFetch(this.db, 'exercises', () => this.exercisesApi.list()));
      this.picked.set(null);
      this.picking.set(true);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  /** Recién agregado desde la biblioteca: ya es mío, queda disponible para sumarlo al entrenamiento. */
  protected adopted(exercise: Exercise): void {
    this.exercises.update((list) => [...list, exercise]);
  }

  protected async addExercise(id: number | null): Promise<void> {
    const exercise = this.exercises().find((e) => e.id === id);
    if (!exercise) return;
    await this.sessions.addExercise(exercise);
    this.picking.set(false);
  }

  protected async finish(bodyweightText: string): Promise<void> {
    const bodyweight = bodyweightText.trim() ? parseDecimal(bodyweightText, 0) || null : null;
    await this.sessions.finish(bodyweight);
    this.timer.stop();
    await this.router.navigateByUrl('/hoy');
  }

  protected async remove(): Promise<void> {
    if (!confirm('¿Eliminar este entrenamiento y todas sus series?')) return;
    await this.sessions.remove();
    this.timer.stop();
    await this.router.navigateByUrl('/hoy');
  }
}
