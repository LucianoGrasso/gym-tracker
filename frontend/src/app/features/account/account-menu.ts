import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideLogOut, lucideUserPlus, lucideUserRound } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import { formatDate } from '../../core/format/format';
import { MAX_PENDING_INVITATIONS } from '../../core/models/invitation';

/** Botón "Mi cuenta" con menú desplegable: datos del usuario, invitaciones y cerrar sesión. */
@Component({
  selector: 'app-account-menu',
  imports: [HlmButton, NgIcon],
  providers: [provideIcons({ lucideChevronDown, lucideLogOut, lucideUserPlus, lucideUserRound })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-block',
    '(document:click)': 'closeIfOutside($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    <button
      type="button"
      class="flex h-11 items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 text-sm font-semibold text-primary"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <ng-icon name="lucideUserRound" size="18" aria-hidden="true" />
      Mi cuenta
      <ng-icon
        name="lucideChevronDown"
        size="16"
        aria-hidden="true"
        class="transition-transform"
        [class.rotate-180]="open()"
      />
    </button>

    @if (open()) {
      <div
        role="menu"
        class="menu-pop absolute top-full right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 shadow-2xl"
      >
        @if (auth.user(); as u) {
          <p class="truncate font-semibold">{{ u.name }}</p>
          <p class="mb-4 truncate text-sm text-muted-foreground">{{ u.email }}</p>
        }

        <button
          hlmBtn
          role="menuitem"
          class="h-11 w-full gap-2"
          [disabled]="busy() || atLimit()"
          (click)="invite()"
        >
          <ng-icon name="lucideUserPlus" size="18" aria-hidden="true" />
          Invitar a alguien
        </button>
        <p class="mt-2 text-xs text-muted-foreground">
          @if (atLimit()) {
            Tienes 5 invitaciones pendientes. Anula una para crear otra.
          } @else {
            El link sirve para una sola cuenta y vence en 7 días.
          }
        </p>
        @if (notice()) {
          <p class="mt-2 text-sm text-primary" role="status">{{ notice() }}</p>
        }
        @if (error()) {
          <p class="mt-2 text-sm text-destructive" role="alert">{{ error() }}</p>
        }

        @if (pending().length) {
          <p class="mt-4 mb-2 eyebrow">Invitaciones pendientes</p>
          <ul class="flex flex-col gap-2">
            @for (inv of pending(); track inv.id) {
              <li class="flex items-center gap-2">
                <span class="flex-1 text-sm">Vence el {{ formatDate(inv.expires_on) }}</span>
                <button hlmBtn variant="outline" class="h-9 px-3" (click)="revoke(inv.id)">
                  Anular
                </button>
              </li>
            }
          </ul>
        }

        <div class="my-4 border-t border-border"></div>
        <button
          type="button"
          role="menuitem"
          class="flex h-11 w-full items-center gap-2 rounded-lg px-1 text-sm text-muted-foreground hover:text-foreground"
          (click)="logout()"
        >
          <ng-icon name="lucideLogOut" size="18" aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>
    }
  `,
})
export class AccountMenu {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(InvitationsApi);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly formatDate = formatDate;
  protected readonly open = signal(false);
  /** Las invitaciones se piden recién al abrir el menú. */
  protected readonly invitations = resource({
    params: () => (this.open() ? true : undefined),
    loader: () => this.api.list(),
  });
  protected readonly pending = computed(() =>
    this.invitations.hasValue() ? this.invitations.value() : [],
  );
  protected readonly atLimit = computed(() => this.pending().length >= MAX_PENDING_INVITATIONS);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected closeIfOutside(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

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
      this.open.set(false);
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
