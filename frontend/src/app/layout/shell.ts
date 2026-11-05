import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNav } from '../shared/ui/bottom-nav';
import { RestTimerBar } from '../shared/ui/rest-timer-bar';
import { SyncIndicator } from '../shared/ui/sync-indicator';
import { UpdateBanner } from '../shared/ui/update-banner';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, BottomNav, RestTimerBar, SyncIndicator, UpdateBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-update-banner />
    <app-sync-indicator />
    <main class="mx-auto max-w-lg px-4 pt-6 pb-40">
      <router-outlet />
    </main>
    <app-rest-timer-bar />
    <app-bottom-nav />
  `,
})
export class Shell {}
