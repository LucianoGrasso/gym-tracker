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

    @if (routines.value(); as list) {
      <ul class="flex flex-col gap-3">
        @for (routine of list; track routine.id) {
          <li class="card p-4">
            <a [routerLink]="['/rutinas', routine.id]" class="block">
              <span class="flex items-center gap-2 text-lg font-semibold">
                {{ routine.name }}
                @if (routine.is_active) { <span hlmBadge>Activa</span> }
              </span>
              <span class="text-sm text-muted-foreground">{{ routine.days_count }} {{ routine.days_count === 1 ? 'día' : 'días' }}</span>
            </a>
            @if (!routine.is_active) {
              <button hlmBtn variant="outline" class="mt-3 h-12 w-full" (click)="activate(routine)">Marcar como activa</button>
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

  async activate(routine: Routine): Promise<void> {
    this.error.set(null);
    try {
      await this.api.activate(routine.id);
      this.routines.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
