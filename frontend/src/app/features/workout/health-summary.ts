import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { WorkoutsApi } from '../../core/api/workouts-api';
import { type HealthFields, hasHealth } from '../../core/health/health-format';

/**
 * FC promedio y kcal de una sesión terminada, tal como las dejó el Atajo de Salud.
 * (La FC máxima no se muestra: Atajos solo entrega promedios de bloques de ~5 min.)
 * Se piden siempre al servidor (no viven en la copia local) y se recargan al volver a la app.
 */
@Component({
  selector: 'app-health-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:visibilitychange)': 'onVisible()' },
  template: `
    @if (health(); as h) {
      <section class="card mb-3 p-4" aria-label="Datos de Salud">
        <p class="eyebrow mb-2">Salud</p>
        <dl class="flex gap-6">
          @if (h.avg_heart_rate !== null) {
            <div>
              <dt class="text-xs text-muted-foreground">FC prom.</dt>
              <dd class="num text-2xl font-bold">{{ h.avg_heart_rate }}<span class="ml-1 text-sm font-semibold">ppm</span></dd>
            </div>
          }
          @if (h.active_calories !== null) {
            <div>
              <dt class="text-xs text-muted-foreground">Energía</dt>
              <dd class="num text-2xl font-bold">{{ h.active_calories }}<span class="ml-1 text-sm font-semibold">kcal</span></dd>
            </div>
          }
        </dl>
      </section>
    }
  `,
})
export class HealthSummary implements OnInit {
  private readonly api = inject(WorkoutsApi);

  readonly workoutId = input.required<string>();
  protected readonly health = signal<HealthFields | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  protected onVisible(): void {
    if (document.visibilityState === 'visible') void this.load();
  }

  private async load(): Promise<void> {
    try {
      const w = await this.api.get(this.workoutId());
      const fields = {
        avg_heart_rate: w.avg_heart_rate ?? null,
        max_heart_rate: w.max_heart_rate ?? null,
        active_calories: w.active_calories ?? null,
      };
      this.health.set(hasHealth(fields) ? fields : null);
    } catch {
      /* sin conexión o sesión aún no sincronizada: no se muestra nada */
    }
  }
}
