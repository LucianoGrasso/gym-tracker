import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SkeletonVariant = 'today' | 'list' | 'page';

/**
 * Bloques que pulsan mientras algo carga, con la forma de lo que viene:
 * - `today`: la pantalla "Hoy";
 * - `list`: filas de tarjetas, para listas bajo un título ya visible;
 * - `page`: título más contenido, para pantallas de detalle.
 * A los 3 s aparece "Cargando tus datos…": la BD puede tardar ~15 s en despertar.
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mx-auto max-w-lg"
      [class.px-4]="withNav()"
      [class.pt-6]="withNav()"
      role="status"
      aria-busy="true"
    >
      <span class="sr-only">Cargando…</span>
      @switch (variant()) {
        @case ('today') {
          <div class="mb-5 flex items-start gap-3">
            <div class="flex-1">
              <div class="skeleton mb-3 h-3 w-28"></div>
              <div class="skeleton mb-2 h-8 w-48"></div>
              <div class="skeleton h-8 w-36"></div>
            </div>
            <div class="skeleton h-11 w-32 rounded-full"></div>
          </div>
          <div class="skeleton mb-6 h-48 rounded-3xl"></div>
          <div class="skeleton mb-3 h-5 w-32"></div>
        }
        @case ('page') {
          <div class="skeleton mb-2 h-9 w-56"></div>
          <div class="skeleton mb-6 h-4 w-40"></div>
          <div class="skeleton mb-4 h-28 rounded-2xl"></div>
        }
      }
      @for (i of rowList(); track i) {
        <div class="skeleton mb-3 h-20 rounded-2xl"></div>
      }
      <p class="skeleton-hint mt-4 text-center text-sm text-muted-foreground">
        Cargando tus datos…
      </p>
    </div>
    @if (withNav()) {
      <div
        class="fixed inset-x-0 bottom-0 h-16 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      ></div>
    }
  `,
})
export class AppSkeleton {
  readonly variant = input<SkeletonVariant>('today');
  /** Filas de tarjetas al final. */
  readonly rows = input(3);
  /** En el arranque no existe el shell: se dibuja también el espacio de la barra inferior. */
  readonly withNav = input(false);

  protected readonly rowList = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
}
