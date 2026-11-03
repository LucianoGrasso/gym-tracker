import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNav } from '../shared/ui/bottom-nav';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, BottomNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto max-w-lg px-4 pb-24 pt-6">
      <router-outlet />
    </main>
    <app-bottom-nav />
  `,
})
export class Shell {}
