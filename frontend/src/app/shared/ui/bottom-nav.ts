import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="fixed inset-x-0 bottom-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      <ul class="mx-auto grid max-w-lg grid-cols-4">
        @for (item of items; track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              routerLinkActive="text-primary font-semibold"
              ariaCurrentWhenActive="page"
              class="flex min-h-14 items-center justify-center text-sm text-muted-foreground"
            >
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
    { path: '/hoy', label: 'Hoy' },
    { path: '/rutinas', label: 'Rutinas' },
    { path: '/ejercicios', label: 'Ejercicios' },
    { path: '/estadisticas', label: 'Estadísticas' },
  ];
}
