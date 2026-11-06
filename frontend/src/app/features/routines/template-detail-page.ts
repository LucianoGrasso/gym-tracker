import { ChangeDetectionStrategy, Component, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { RoutineTemplatesApi } from '../../core/api/routine-templates-api';
import { formatRest, formatTargets } from '../../core/format/training';
import { SET_TYPE_LABELS, TEMPLATE_GOAL_LABELS, TEMPLATE_LEVEL_LABELS } from '../../core/models/labels';

import { AppSkeleton } from '../../shared/ui/app-skeleton';

@Component({
  selector: 'app-template-detail-page',
  imports: [RouterLink, HlmBadge, HlmButton, AppSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/rutinas/plantillas" class="mb-4 inline-block text-sm text-muted-foreground">← Plantillas</a>

    @if (template.error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">No se pudo cargar el catálogo. Revisa tu conexión.</p>
      <button hlmBtn variant="outline" class="h-12 w-full" (click)="template.reload()">Reintentar</button>
    } @else if (template.value(); as t) {
      <h1 class="mb-1 page-title">{{ t.name }}</h1>
      @if (t.inspired_by) { <p class="text-sm text-muted-foreground">Inspirada en {{ t.inspired_by }}</p> }
      <p class="mt-2 flex flex-wrap gap-2">
        <span hlmBadge variant="outline">{{ t.days_per_week }} días</span>
        <span hlmBadge variant="outline">{{ levelLabels[t.level] }}</span>
        <span hlmBadge variant="outline">{{ goalLabels[t.goal] }}</span>
      </p>
      <p class="mt-3 mb-6 text-muted-foreground">{{ t.description }}</p>

      @for (day of t.days; track $index) {
        <section class="mb-4">
          <h2 class="mb-2 section-title">{{ day.name }}</h2>
          <ul class="flex flex-col gap-2">
            @for (e of day.exercises; track $index) {
              <li class="card p-3">
                <span class="block font-medium">{{ e.name }}</span>
                <span class="text-sm text-muted-foreground">
                  {{ formatTargets(e) }} · {{ setTypeLabels[e.default_set_type] }} · {{ formatRest(e.rest_seconds) }}
                </span>
                @if (e.target_text) { <span class="block text-sm text-muted-foreground">{{ e.target_text }}</span> }
              </li>
            }
          </ul>
        </section>
      }

      <div class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-6 bg-background/90 py-2 backdrop-blur">
        @if (error()) { <p class="mb-2 text-sm text-destructive" role="alert">{{ error() }}</p> }
        <button hlmBtn class="h-12 w-full" [disabled]="importing()" (click)="importTemplate(t.slug)">
          {{ importing() ? 'Agregando…' : 'Agregar a mis rutinas' }}
        </button>
      </div>
    } @else if (template.isLoading()) {
      <app-skeleton variant="page" />
    } @else {
      <p class="text-muted-foreground">Esta plantilla no existe.</p>
    }
  `,
})
export class TemplateDetailPage {
  private readonly api = inject(RoutineTemplatesApi);
  private readonly router = inject(Router);

  readonly slug = input.required<string>();

  protected readonly levelLabels = TEMPLATE_LEVEL_LABELS;
  protected readonly goalLabels = TEMPLATE_GOAL_LABELS;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly formatTargets = formatTargets;
  protected readonly formatRest = formatRest;

  protected readonly template = resource({ params: () => this.slug(), loader: ({ params }) => this.api.find(params) });
  protected readonly importing = signal(false);
  protected readonly error = signal<string | null>(null);

  async importTemplate(slug: string): Promise<void> {
    this.importing.set(true);
    this.error.set(null);
    try {
      const routine = await this.api.import(slug);
      await this.router.navigate(['/rutinas', routine.id], { queryParams: { agregada: 1 } });
    } catch {
      this.error.set('No se pudo agregar la plantilla. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.importing.set(false);
    }
  }
}
