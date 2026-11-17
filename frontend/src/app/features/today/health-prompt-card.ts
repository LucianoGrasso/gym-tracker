import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHeartPulse } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { WorkoutsApi } from '../../core/api/workouts-api';
import { HealthStore } from '../../core/health/health-store';
import { OPEN_URL, RUN_SHORTCUT_URL } from '../../core/health/shortcut';
import { SyncService } from '../../core/sync/sync.service';

/** Tras terminar una sesión hoy: ofrece correr el Atajo "GymTracker Salud". */
@Component({
  selector: 'app-health-prompt-card',
  imports: [HlmButton, NgIcon],
  providers: [provideIcons({ lucideHeartPulse })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:visibilitychange)': 'onVisible()' },
  template: `
    @if (visible()) {
      <section class="card mb-5 p-4">
        <div class="mb-3 flex items-center gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ng-icon name="lucideHeartPulse" size="20" aria-hidden="true" />
          </span>
          <p class="text-sm">
            @if (!sync.online()) {
              Sin conexión: se completará con la sincronización nocturna.
            } @else if (sync.pending() > 0) {
              Enviando la sesión…
            } @else {
              Agrega a tu sesión la FC y las kcal que registró Salud.
            }
          </p>
        </div>
        <button hlmBtn class="h-12 w-full" [disabled]="!ready()" (click)="run()">
          Traer FC y kcal de Salud
        </button>
        <button
          type="button"
          class="mt-2 w-full text-center text-sm text-muted-foreground underline"
          (click)="store.forgetFinished()"
        >
          Ahora no
        </button>
      </section>
    }
  `,
})
export class HealthPromptCard implements OnInit {
  protected readonly store = inject(HealthStore);
  protected readonly sync = inject(SyncService);
  private readonly api = inject(WorkoutsApi);
  private readonly openUrl = inject(OPEN_URL);

  /** Fecha local de hoy (`Today.date`). */
  readonly today = input.required<string>();

  protected readonly visible = computed(
    () => this.store.configured() && this.store.lastFinished()?.date === this.today(),
  );
  protected readonly ready = computed(() => this.sync.online() && this.sync.pending() === 0);

  ngOnInit(): void {
    void this.checkSynced();
  }

  protected onVisible(): void {
    if (document.visibilityState === 'visible') void this.checkSynced();
  }

  protected run(): void {
    this.openUrl(RUN_SHORTCUT_URL);
  }

  /** Si el Atajo ya dejó datos en el servidor, la tarjeta sobra. */
  private async checkSynced(): Promise<void> {
    const last = this.store.lastFinished();
    if (!this.visible() || !last || !this.ready()) return;
    try {
      const workout = await this.api.get(last.id);
      if (workout.health_synced_at) this.store.forgetFinished();
    } catch {
      /* sin conexión: se vuelve a revisar al regresar a la app */
    }
  }
}
