import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HealthApi } from '../../core/api/health-api';
import { HealthStore } from '../../core/health/health-store';
import { HEALTH_SHORTCUT_INSTALL_URL, OPEN_URL } from '../../core/health/shortcut';
import { ConfirmService } from '../../shared/ui/confirm-dialog';

/** Mi cuenta → token del Atajo "GymTracker Salud" (FC y kcal desde Apple Salud). */
@Component({
  selector: 'app-health-shortcut-section',
  imports: [HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="text-sm font-semibold">Atajo de Salud</p>
    <p class="mt-1 mb-3 text-xs text-muted-foreground">
      Envía la FC y las kcal de Salud (AirPods o Watch) a tus sesiones.
    </p>

    @if (token(); as t) {
      <p class="mb-1 text-xs text-muted-foreground">Cópialo ahora: no se vuelve a mostrar.</p>
      <code class="block rounded-lg bg-muted p-2 text-xs break-all">{{ t }}</code>
      <div class="mt-2 flex gap-2">
        <button hlmBtn variant="outline" class="h-10 flex-1" (click)="copy(t)">Copiar</button>
        @if (installUrl) {
          <button hlmBtn class="h-10 flex-1" (click)="install(t)">Instalar Atajo</button>
        }
      </div>
    }

    <div class="mt-2 flex gap-2">
      <button hlmBtn variant="outline" class="h-10 flex-1" [disabled]="busy()" (click)="generate()">
        {{ store.configured() ? 'Generar otro token' : 'Generar token' }}
      </button>
      @if (store.configured()) {
        <button hlmBtn variant="ghost" class="h-10 text-destructive" [disabled]="busy()" (click)="disconnect()">
          Desconectar
        </button>
      }
    </div>

    @if (notice()) {
      <p class="mt-2 text-xs text-primary" role="status">{{ notice() }}</p>
    }
    @if (error()) {
      <p class="mt-2 text-xs text-destructive" role="alert">{{ error() }}</p>
    }
  `,
})
export class HealthShortcutSection {
  private readonly api = inject(HealthApi);
  private readonly confirm = inject(ConfirmService);
  private readonly openUrl = inject(OPEN_URL);
  protected readonly store = inject(HealthStore);

  protected readonly installUrl = HEALTH_SHORTCUT_INSTALL_URL;
  protected readonly token = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  async generate(): Promise<void> {
    this.reset();
    this.busy.set(true);
    try {
      this.token.set(await this.api.createToken());
      this.store.setConfigured(true);
    } catch {
      this.error.set('No se pudo generar el token. Revisa tu conexión.');
    } finally {
      this.busy.set(false);
    }
  }

  async copy(token: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(token);
      this.notice.set('Token copiado');
    } catch {
      this.error.set('No se pudo copiar. Mantén presionado el token para copiarlo.');
    }
  }

  /** Copia el token (la importación del Atajo lo pide) y abre el enlace iCloud. */
  async install(token: string): Promise<void> {
    await this.copy(token);
    this.openUrl(this.installUrl);
  }

  async disconnect(): Promise<void> {
    const ok = await this.confirm.ask({
      title: '¿Desconectar el Atajo de Salud?',
      message: 'El Atajo dejará de funcionar hasta que generes un token nuevo.',
      confirmLabel: 'Desconectar',
      destructive: true,
    });
    if (!ok) return;
    this.reset();
    this.busy.set(true);
    try {
      await this.api.revokeToken();
      this.token.set(null);
      this.store.setConfigured(false);
    } catch {
      this.error.set('No se pudo desconectar. Revisa tu conexión.');
    } finally {
      this.busy.set(false);
    }
  }

  private reset(): void {
    this.notice.set(null);
    this.error.set(null);
  }
}
