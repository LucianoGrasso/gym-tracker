import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/** "1 h 52 min" / "8 min". */
function formatLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** Franja de la cuenta de demo: cuánto le queda y "Salir"; al vencer cierra la sesión. */
@Component({
  selector: 'app-demo-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (expiresAt() !== null) {
      <div class="mb-4 flex items-center gap-3 rounded-full border border-primary/40 bg-primary/10 py-1.5 pr-1.5 pl-4 text-sm" role="status">
        <span class="flex-1"><b class="font-semibold text-primary">Modo demo</b> · se borra en {{ left() }}</span>
        <button type="button" class="h-9 rounded-full px-3 text-sm font-semibold text-primary underline" (click)="exit()">Salir</button>
      </div>
    }
  `,
})
export class DemoBanner {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly now = signal(Date.now());
  protected readonly expiresAt = computed(() => {
    const iso = this.auth.user()?.demo_expires_at;
    return iso ? new Date(iso).getTime() : null;
  });
  protected readonly left = computed(() => formatLeft((this.expiresAt() ?? 0) - this.now()));

  constructor() {
    const handle = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(handle));
    effect(() => {
      const end = this.expiresAt();
      if (end !== null && this.now() >= end) void this.exit();
    });
  }

  protected async exit(): Promise<void> {
    try {
      await this.auth.logout();
    } catch {
      // Ya vencida: el servidor respondió 401; igual se vuelve al login.
    }
    await this.router.navigateByUrl('/login');
  }
}
