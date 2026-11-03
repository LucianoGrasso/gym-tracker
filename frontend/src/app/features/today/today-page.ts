import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-today-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold">Hoy</h1>
    <p class="mt-2 text-muted-foreground">Hola, {{ auth.user()?.name }}. El entrenamiento de hoy llega en la fase 2.</p>
  `,
})
export class TodayPage {
  protected readonly auth = inject(AuthService);
}
