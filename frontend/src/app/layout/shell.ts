import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNav } from '../shared/ui/bottom-nav';
import { RestTimerBar } from '../shared/ui/rest-timer-bar';
import { SyncIndicator } from '../shared/ui/sync-indicator';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, BottomNav, RestTimerBar, SyncIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sticky top-0 z-10 bg-background/90 backdrop-blur">
      <div class="mx-auto flex max-w-lg justify-end px-4 py-2"><app-sync-indicator /></div>
    </div>
    <main class="mx-auto max-w-lg px-4 pb-40 pt-2">
      <router-outlet />
    </main>
    <app-rest-timer-bar />
    <app-bottom-nav />
  `,
})
export class Shell {}
