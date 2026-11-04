import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendarCheck, lucideChartLine, lucideDumbbell, lucideListChecks } from '@ng-icons/lucide';

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, NgIcon],
  providers: [provideIcons({ lucideCalendarCheck, lucideListChecks, lucideDumbbell, lucideChartLine })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      aria-label="Navegación principal"
    >
      <ul class="mx-auto grid max-w-lg grid-cols-4">
        @for (item of items; track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              routerLinkActive="text-primary"
              ariaCurrentWhenActive="page"
              class="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              <ng-icon [name]="item.icon" size="22" aria-hidden="true" />
              {{ item.label }}
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class BottomNav {
  protected readonly items = [
    { path: '/hoy', label: 'Hoy', icon: 'lucideCalendarCheck' },
    { path: '/rutinas', label: 'Rutinas', icon: 'lucideListChecks' },
    { path: '/ejercicios', label: 'Ejercicios', icon: 'lucideDumbbell' },
    { path: '/estadisticas', label: 'Estadísticas', icon: 'lucideChartLine' },
  ];
}
