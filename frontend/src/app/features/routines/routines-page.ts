import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '../../core/api/api-error';
import { RoutinesApi } from '../../core/api/routines-api';
import type { Routine } from '../../core/models/routine';

import { AppSkeleton } from '../../shared/ui/app-skeleton';

@Component({
  selector: 'app-routines-page',
  imports: [RouterLink, HlmBadge, HlmButton, HlmInput, AppSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-4 page-title">Rutinas</h1>

    <form class="mb-3 flex gap-2" (submit)="$event.preventDefault(); create()">
      <input hlmInput class="h-12 flex-1 text-base" placeholder="Nombre de la nueva rutina"
             [value]="newName()" (input)="newName.set($any($event.target).value)" aria-label="Nombre de la nueva rutina" />
      <button hlmBtn type="submit" class="h-12 px-4" [disabled]="!newName().trim()">Crear</button>
    </form>
    <a hlmBtn variant="outline" routerLink="/rutinas/plantillas" class="mb-6 flex h-12 w-full items-center justify-center">Explorar plantillas</a>

    @if (error()) { <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p> }

    @if (routines.hasValue() && routines.value(); as list) {
      <ul class="flex flex-col gap-3">
        @for (routine of list; track routine.id) {
          <li
            class="card p-4 transition-colors duration-300"
            [class.border-primary]="routine.is_active"
            [class.routine-activated]="justActivated() === routine.id"
          >
            <a [routerLink]="['/rutinas', routine.id]" class="block">
              <span class="flex items-center gap-2 text-lg font-semibold">
                {{ routine.name }}
                @if (routine.is_active) {
                  <span hlmBadge [class.badge-pop]="justActivated() === routine.id">Activa</span>
                }
              </span>
              <span class="text-sm text-muted-foreground">{{ routine.days_count }} {{ routine.days_count === 1 ? 'día' : 'días' }}</span>
            </a>
            @if (!routine.is_active) {
              <button hlmBtn variant="outline" class="mt-3 h-12 w-full" [disabled]="activating() !== null" (click)="activate(routine)">
                {{ activating() === routine.id ? 'Activando…' : 'Marcar como activa' }}
              </button>
            }
          </li>
        } @empty {
          <li class="text-muted-foreground">Todavía no tienes rutinas.</li>
        }
      </ul>
    } @else if (routines.isLoading()) {
      <app-skeleton variant="list" [rows]="4" />
    }
  `,
})
export class RoutinesPage {
  private readonly api = inject(RoutinesApi);
  private readonly router = inject(Router);

  protected readonly newName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly routines = resource({ loader: () => this.api.list() });

  async create(): Promise<void> {
    this.error.set(null);
    try {
      const routine = await this.api.create({ name: this.newName().trim(), notes: null });
      await this.router.navigate(['/rutinas', routine.id]);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  /** Rutina que se está activando (botón en "Activando…"). */
  protected readonly activating = signal<number | null>(null);
  /** Rutina recién activada: su tarjeta destella y la etiqueta "Activa" aparece con un rebote. */
  protected readonly justActivated = signal<number | null>(null);

  async activate(routine: Routine): Promise<void> {
    this.error.set(null);
    this.activating.set(routine.id);
    try {
      await this.api.activate(routine.id);
      // Se actualiza en el lugar (sin recargar) para que las tarjetas no salten; el orden "activa primero"
      // se aplica la próxima vez que se abra la lista.
      this.routines.value.update((list) => list?.map((r) => ({ ...r, is_active: r.id === routine.id })));
      this.justActivated.set(routine.id);
      navigator.vibrate?.(15);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.activating.set(null);
    }
  }
}
