import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, InjectionToken, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { NEVER, filter, map } from 'rxjs';

/** Recarga la página; es un token para poder reemplazarlo en los tests. */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.location.reload();
  },
});

/**
 * Avisa cuando el service worker ya descargó una versión nueva. No recarga solo:
 * si estás a mitad de un entrenamiento, eliges tú cuándo hacerlo.
 */
@Component({
  selector: 'app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ready()) {
      <div class="sticky top-[env(safe-area-inset-top)] z-10 bg-background/90 px-4 pt-2 backdrop-blur">
        <div
          class="mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <span class="flex-1">Hay una nueva versión de GymTracker.</span>
          <button type="button" class="font-semibold text-primary underline" (click)="reload()">Actualizar</button>
        </div>
      </div>
    }
  `,
})
export class UpdateBanner {
  private readonly updates = inject(SwUpdate, { optional: true });
  protected readonly reload = inject(RELOAD_PAGE);

  protected readonly ready = toSignal(
    (this.updates?.versionUpdates ?? NEVER).pipe(
      filter((event) => event.type === 'VERSION_READY'),
      map(() => true),
    ),
    { initialValue: false },
  );
}
