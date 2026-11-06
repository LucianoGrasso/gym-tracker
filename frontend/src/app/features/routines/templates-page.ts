import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { RoutineTemplatesApi } from '../../core/api/routine-templates-api';
import { TEMPLATE_GOAL_LABELS, TEMPLATE_LEVEL_LABELS } from '../../core/models/labels';

import { AppSkeleton } from '../../shared/ui/app-skeleton';

@Component({
  selector: 'app-templates-page',
  imports: [RouterLink, HlmBadge, HlmButton, AppSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/rutinas" class="mb-4 inline-block text-sm text-muted-foreground">← Rutinas</a>
    <h1 class="mb-1 page-title">Plantillas</h1>
    <p class="mb-6 text-sm text-muted-foreground">Rutinas de programas y atletas conocidos. Agrégalas a tus rutinas y actívalas cuando quieras.</p>

    @if (templates.error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">No se pudo cargar el catálogo. Revisa tu conexión.</p>
      <button hlmBtn variant="outline" class="h-12 w-full" (click)="templates.reload()">Reintentar</button>
    } @else if (templates.value(); as list) {
      <ul class="flex flex-col gap-3">
        @for (t of list; track t.slug) {
          <li>
            <a [routerLink]="['/rutinas/plantillas', t.slug]" class="card block p-4">
              <span class="block text-lg font-semibold">{{ t.name }}</span>
              @if (t.inspired_by) {
                <span class="block text-sm text-muted-foreground">Inspirada en {{ t.inspired_by }}</span>
              }
              <span class="mt-2 flex flex-wrap gap-2">
                <span hlmBadge variant="outline">{{ t.days_per_week }} días</span>
                <span hlmBadge variant="outline">{{ levelLabels[t.level] }}</span>
                <span hlmBadge variant="outline">{{ goalLabels[t.goal] }}</span>
              </span>
              <span class="mt-2 line-clamp-2 block text-sm text-muted-foreground">{{ t.description }}</span>
            </a>
          </li>
        }
      </ul>
    } @else {
      <app-skeleton variant="list" [rows]="5" />
    }
  `,
})
export class TemplatesPage {
  private readonly api = inject(RoutineTemplatesApi);

  protected readonly levelLabels = TEMPLATE_LEVEL_LABELS;
  protected readonly goalLabels = TEMPLATE_GOAL_LABELS;
  protected readonly templates = resource({ loader: () => this.api.list() });
}
