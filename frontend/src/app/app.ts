import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { filter, map, take } from 'rxjs';
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
  /** Hasta que termina la primera navegación (el guard espera la sesión) se ve el logo animado; luego cada pantalla muestra su skeleton. */
  protected readonly booting = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError),
      take(1),
      map(() => false),
    ),
    { initialValue: true },
  );

  constructor() {
    // Despierta la BD (Aurora) mientras el usuario mira la pantalla.
    inject(HttpClient).get('/api/health').subscribe({ error: () => undefined });
    inject(SyncService).start();
    void inject(WorkoutSessionService).restoreActive();
  }
}
