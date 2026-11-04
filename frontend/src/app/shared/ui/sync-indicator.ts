import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SyncService } from '../../core/sync/sync.service';
import { syncLabel } from '../../core/sync/sync-label';

@Component({
  selector: 'app-sync-indicator',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p
      class="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs"
      [class.text-muted-foreground]="ok()"
      [class.text-amber-300]="!ok()"
      aria-live="polite"
    >
      <span class="size-2 rounded-full" [class.bg-primary]="ok()" [class.bg-amber-400]="!ok()"></span>
      {{ label() }}
      @if (sync.state() === 'auth') {
        <a routerLink="/login" class="font-semibold underline">Entrar</a>
      } @else if (sync.failed() > 0) {
        <button type="button" class="font-semibold underline" (click)="sync.retryFailed()">Reintentar</button>
      }
    </p>
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
