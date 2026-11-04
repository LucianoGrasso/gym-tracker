import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { AuthService } from '../../core/auth/auth.service';
import { SyncService } from '../../core/sync/sync.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, HlmButton, HlmInput, HlmLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 class="mb-8 page-title text-5xl">Gym<span class="text-primary">Tracker</span></h1>
      <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="email">Correo</label>
          <input hlmInput id="email" type="email" autocomplete="email" inputmode="email"
                 formControlName="email" class="h-12 text-base" />
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="password">Contraseña</label>
          <input hlmInput id="password" type="password" autocomplete="current-password"
                 formControlName="password" class="h-12 text-base" />
        </div>
        @if (error()) {
          <p class="text-sm text-destructive" role="alert">{{ error() }}</p>
        }
        <button hlmBtn type="submit" class="h-12 text-base" [disabled]="loading()">
          {{ loading() ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sync = inject(SyncService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.error.set('Ingresa tu correo y contraseña.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      // Lo que quedó pendiente por un 401 se envía apenas hay sesión.
      void this.sync.flush();
      await this.router.navigateByUrl('/hoy');
    } catch (e) {
      this.error.set(
        e instanceof HttpErrorResponse && e.status === 422
          ? 'Correo o contraseña incorrectos.'
          : 'No se pudo conectar. Intenta de nuevo.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
