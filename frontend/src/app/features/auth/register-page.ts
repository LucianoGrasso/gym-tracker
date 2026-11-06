import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import { SyncService } from '../../core/sync/sync.service';

type State = 'loading' | 'signed-in' | 'invalid' | 'form';

import { AppSkeleton } from '../../shared/ui/app-skeleton';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, HlmButton, HlmInput, HlmLabel, AppSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <h1 class="mb-6 page-title text-5xl">Gym<span class="text-primary">Tracker</span></h1>
      @switch (state()) {
        @case ('loading') {
          <app-skeleton variant="list" [rows]="3" />
        }
        @case ('signed-in') {
          <p class="mb-4">Ya tienes una sesión iniciada. Para crear otra cuenta con esta invitación, primero cierra la tuya.</p>
          <a hlmBtn routerLink="/hoy" class="mb-3 h-12 w-full">Ir a GymTracker</a>
          <button hlmBtn variant="outline" class="h-12 w-full" (click)="signOut()">Cerrar sesión para usar esta invitación</button>
        }
        @case ('invalid') {
          <p class="mb-4" role="alert">Este link de invitación ya no es válido. Pídele uno nuevo a quien te invitó.</p>
          <a routerLink="/login" class="text-primary underline">Ir a iniciar sesión</a>
        }
        @case ('form') {
          <p class="mb-6"><strong>{{ inviter() }}</strong> te invitó a GymTracker.</p>
          <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="name">Nombre</label>
              <input hlmInput id="name" autocomplete="name" formControlName="name" class="h-12 text-base" />
              @if (fieldError('name'); as e) { <p class="text-sm text-destructive">{{ e }}</p> }
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="email">Correo</label>
              <input hlmInput id="email" type="email" autocomplete="email" inputmode="email" formControlName="email" class="h-12 text-base" />
              @if (fieldError('email'); as e) { <p class="text-sm text-destructive">{{ e }}</p> }
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="password">Contraseña</label>
              <input hlmInput id="password" type="password" autocomplete="new-password" formControlName="password" class="h-12 text-base" />
              @if (fieldError('password'); as e) { <p class="text-sm text-destructive">{{ e }}</p> }
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="password_confirmation">Repite la contraseña</label>
              <input hlmInput id="password_confirmation" type="password" autocomplete="new-password" formControlName="password_confirmation" class="h-12 text-base" />
            </div>
            @if (error()) { <p class="text-sm text-destructive" role="alert">{{ error() }}</p> }
            <button hlmBtn type="submit" class="h-12 text-base" [disabled]="loading()">
              {{ loading() ? 'Creando cuenta…' : 'Crear cuenta' }}
            </button>
          </form>
        }
      }
    </main>
  `,
})
export class RegisterPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly invitations = inject(InvitationsApi);
  private readonly router = inject(Router);
  private readonly sync = inject(SyncService);

  readonly token = input.required<string>();

  protected readonly state = signal<State>('loading');
  protected readonly inviter = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly serverErrors = signal<Record<string, string>>({});

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    password_confirmation: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  async ngOnInit(): Promise<void> {
    const current = await this.auth.loadUser().catch(() => null);
    if (current) {
      this.state.set('signed-in');
      return;
    }
    await this.loadPreview();
  }

  protected fieldError(field: string): string | null {
    return this.serverErrors()[field] ?? null;
  }

  async signOut(): Promise<void> {
    await this.auth.logout().catch(() => undefined);
    await this.loadPreview();
  }

  async submit(): Promise<void> {
    const value = this.form.getRawValue();
    if (this.form.invalid) {
      this.error.set('Completa todos los campos. La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (value.password !== value.password_confirmation) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.serverErrors.set({});
    try {
      await this.auth.register({ token: this.token(), ...value });
      void this.sync.flush();
      await this.router.navigateByUrl('/hoy');
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 422) {
        const errors = (e.error?.errors ?? {}) as Record<string, string[]>;
        this.serverErrors.set(Object.fromEntries(Object.entries(errors).map(([key, list]) => [key, list[0]])));
      } else if (e instanceof HttpErrorResponse && e.status === 410) {
        this.state.set('invalid');
      } else {
        this.error.set('No se pudo conectar. Intenta de nuevo.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPreview(): Promise<void> {
    this.state.set('loading');
    try {
      const preview = await this.invitations.preview(this.token());
      this.inviter.set(preview.inviter_name);
      this.state.set('form');
    } catch {
      this.state.set('invalid');
    }
  }
}
