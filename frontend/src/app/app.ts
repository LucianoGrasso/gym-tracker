import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SyncService } from './core/sync/sync.service';
import { WorkoutSessionService } from './core/workout/workout-session.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  constructor() {
    // Despierta la BD (Aurora) mientras el usuario mira la pantalla.
    inject(HttpClient).get('/api/health').subscribe({ error: () => undefined });
    inject(SyncService).start();
    void inject(WorkoutSessionService).restoreActive();
  }
}
