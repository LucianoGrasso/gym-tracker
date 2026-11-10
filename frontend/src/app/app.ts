import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { FONTS_READY } from './core/fonts';
import { SyncService } from './core/sync/sync.service';
import { WorkoutSessionService } from './core/workout/workout-session.service';
import { BootSplash } from './shared/ui/boot-splash';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BootSplash],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  private readonly navigated = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError),
      take(1),
      map(() => true),
    ),
    { initialValue: false },
  );
  private readonly fontsReady = signal(false);
  /**
   * Se ve el logo animado hasta que termina la primera navegación (el guard espera la sesión) y están
   * las fuentes (así la primera pantalla no cambia de fuente); luego cada pantalla muestra su skeleton.
   */
  protected readonly booting = computed(() => !this.navigated() || !this.fontsReady());

  constructor() {
    void inject(FONTS_READY).then(() => this.fontsReady.set(true));
    // Despierta la BD (Aurora) mientras el usuario mira la pantalla.
    inject(HttpClient).get('/api/health').subscribe({ error: () => undefined });
    inject(SyncService).start();
    void inject(WorkoutSessionService).restoreActive();
  }
}
