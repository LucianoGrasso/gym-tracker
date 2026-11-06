import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import { formatDate } from '../../core/format/format';
import { MAX_PENDING_INVITATIONS } from '../../core/models/invitation';

@Component({
  selector: 'app-account-page',
  imports: [HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-1 page-title">Cuenta</h1>
    @if (auth.user(); as u) {
      <p class="font-medium">{{ u.name }}</p>
      <p class="mb-6 text-sm text-muted-foreground">{{ u.email }}</p>
    }

    <section class="mb-6 card p-4">
      <h2 class="mb-1 section-title">Invitar a alguien</h2>
      <p class="mb-3 text-sm text-muted-foreground">El link sirve para crear una sola cuenta y vence en 7 días.</p>
      <button hlmBtn class="h-12 w-full" [disabled]="busy() || atLimit()" (click)="invite()">Invitar a alguien</button>
      @if (atLimit()) {
        <p class="mt-2 text-sm text-muted-foreground">Tienes 5 invitaciones pendientes. Anula una para crear otra.</p>
      }
      @if (notice()) { <p class="mt-2 text-sm text-primary" role="status">{{ notice() }}</p> }
      @if (error()) { <p class="mt-2 text-sm text-destructive" role="alert">{{ error() }}</p> }

      @if (pending().length) {
        <h3 class="mt-5 mb-2 eyebrow">Invitaciones pendientes</h3>
        <ul class="flex flex-col gap-2">
          @for (inv of pending(); track inv.id) {
            <li class="flex items-center gap-3">
              <span class="flex-1 text-sm">Vence el {{ formatDate(inv.expires_on) }}</span>
              <button hlmBtn variant="outline" class="h-10" (click)="revoke(inv.id)">Anular</button>
            </li>
          }
        </ul>
      }
    </section>

    <button hlmBtn variant="outline" class="h-12 w-full" (click)="logout()">Cerrar sesión</button>
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(InvitationsApi);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  protected readonly formatDate = formatDate;
  protected readonly invitations = resource({ loader: () => this.api.list() });
  protected readonly pending = computed(() => (this.invitations.hasValue() ? this.invitations.value() : []));
  protected readonly atLimit = computed(() => this.pending().length >= MAX_PENDING_INVITATIONS);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  async invite(): Promise<void> {
    this.busy.set(true);
    this.notice.set(null);
    this.error.set(null);
    try {
      const created = await this.api.create();
      this.invitations.value.update((list) => [created, ...(list ?? [])]);
      await this.share(`${this.document.location.origin}/registro/${created.token}`);
    } catch {
      this.error.set('No se pudo crear la invitación. Revisa tu conexión.');
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(id: number): Promise<void> {
    this.error.set(null);
    try {
      await this.api.revoke(id);
      this.invitations.value.update((list) => (list ?? []).filter((i) => i.id !== id));
    } catch {
      this.error.set('No se pudo anular la invitación.');
    }
  }

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
      await this.router.navigateByUrl('/login');
    } catch {
      this.error.set('No se pudo cerrar sesión. Revisa tu conexión.');
    }
  }

  /** Menú nativo de compartir; si no existe o falla (salvo que el usuario cancele), copia el link. */
  private async share(url: string): Promise<void> {
    const text = `${this.auth.user()?.name ?? 'Alguien'} te invitó a GymTracker`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'GymTracker', text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(url);
    this.notice.set('Link copiado');
  }
}
