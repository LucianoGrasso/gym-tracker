import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LOCAL_DB } from '../local-db/local-db';
import { claimLocalData } from '../local-db/owner';
import type { User } from '../models/user';

interface UserResponse {
  data: User;
}

export interface RegisterInput {
  token: string;
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

/** Reinicia la app en "Hoy" (suelta todo lo que quedó en memoria de la cuenta anterior). */
export const RELOAD_APP = new InjectionToken<() => void>('RELOAD_APP', {
  providedIn: 'root',
  factory: () => () => window.location.replace('/hoy'),
});

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(LOCAL_DB);
  private readonly reload = inject(RELOAD_APP);
  private readonly currentUser = signal<User | null | undefined>(undefined);

  /** undefined = todavía no se consultó; null = sin sesión. */
  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUser());

  async loadUser(): Promise<User | null> {
    try {
      const { data } = await firstValueFrom(this.http.get<UserResponse>('/api/user'));
      await this.adopt(data);
      return data;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.currentUser.set(null);
        return null;
      }
      throw error;
    }
  }

  async login(email: string, password: string): Promise<User> {
    await firstValueFrom(this.http.get('/sanctum/csrf-cookie'));
    const { data } = await firstValueFrom(
      this.http.post<UserResponse>('/auth/login', { email, password }),
    );
    await this.adopt(data);
    return data;
  }

  async register(input: RegisterInput): Promise<User> {
    await firstValueFrom(this.http.get('/sanctum/csrf-cookie'));
    const { data } = await firstValueFrom(this.http.post<UserResponse>('/auth/register', input));
    await this.adopt(data);
    return data;
  }

  /** Cuenta temporal de "Probar demo" (2 h, con datos de ejemplo). */
  async startDemo(): Promise<User> {
    await firstValueFrom(this.http.get('/sanctum/csrf-cookie'));
    const { data } = await firstValueFrom(this.http.post<UserResponse>('/auth/demo', {}));
    await this.adopt(data);
    return data;
  }

  /** Los datos locales de otra cuenta se borran y la app se reinicia antes de usarlos. */
  private async adopt(user: User): Promise<void> {
    const switched = await claimLocalData(this.db, user.id);
    this.currentUser.set(user);
    if (switched) this.reload();
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/auth/logout', {}));
    } finally {
      // Aunque falle (p. ej. demo ya vencida: 401), localmente ya no hay sesión.
      this.currentUser.set(null);
    }
  }
}
