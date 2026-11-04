import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCloudOff, lucideTriangleAlert } from '@ng-icons/lucide';
import { SyncService } from '../../core/sync/sync.service';
import { syncLabel } from '../../core/sync/sync-label';

/** Aviso de sincronización: invisible mientras todo se guarda bien; aparece solo ante un problema. */
@Component({
  selector: 'app-sync-indicator',
  imports: [RouterLink, NgIcon],
  providers: [provideIcons({ lucideCloudOff, lucideTriangleAlert })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!ok()) {
      <div class="sticky top-0 z-10 bg-background/90 px-4 pt-2 backdrop-blur">
        <div
          class="mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
          role="status"
          aria-live="polite"
        >
          <ng-icon [name]="sync.state() === 'offline' ? 'lucideCloudOff' : 'lucideTriangleAlert'" size="18" aria-hidden="true" />
          <span class="flex-1">{{ label() }}</span>
          @if (sync.state() === 'auth') {
            <a routerLink="/login" class="font-semibold text-amber-100 underline">Entrar</a>
          } @else if (sync.failed() > 0) {
            <button type="button" class="font-semibold text-amber-100 underline" (click)="sync.retryFailed()">
              Reintentar
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class SyncIndicator {
  protected readonly sync = inject(SyncService);
  protected readonly label = computed(() =>
    syncLabel(this.sync.state(), this.sync.pending(), this.sync.failed()),
  );
  protected readonly ok = computed(
    () => ['idle', 'syncing'].includes(this.sync.state()) && this.sync.failed() === 0,
  );
}
