import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Silueta de "Hoy" mientras carga: arranque de la app (la BD puede tardar ~15 s en despertar) y
 * carga del día. Si `index.html` cambia de forma, mantener su copia estática en sincronía.
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-lg" [class.px-4]="withNav()" [class.pt-6]="withNav()" role="status" aria-busy="true">
      <span class="sr-only">Cargando…</span>
      <div class="mb-5 flex items-start gap-3">
        <div class="flex-1">
          <div class="skeleton mb-3 h-3 w-28"></div>
          <div class="skeleton mb-2 h-8 w-48"></div>
          <div class="skeleton h-8 w-36"></div>
        </div>
        <div class="skeleton size-11 rounded-full"></div>
      </div>
      <div class="skeleton mb-6 h-48 rounded-3xl"></div>
      <div class="skeleton mb-3 h-5 w-32"></div>
      @for (i of rows; track i) {
        <div class="skeleton mb-3 h-20 rounded-2xl"></div>
      }
      <p class="skeleton-hint mt-4 text-center text-sm text-muted-foreground">Cargando tus datos…</p>
    </div>
    @if (withNav()) {
      <div class="fixed inset-x-0 bottom-0 h-16 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"></div>
    }
  `,
})
export class AppSkeleton {
  /** En el arranque no existe el shell: se dibuja también el espacio de la barra inferior. */
  readonly withNav = input(false);
  protected readonly rows = [0, 1, 2];
}
