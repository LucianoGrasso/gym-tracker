import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly currentUser = signal<User | null | undefined>(undefined);

  /** undefined = todavía no se consultó; null = sin sesión. */
  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUser());

  async loadUser(): Promise<User | null> {
    try {
      const { data } = await firstValueFrom(this.http.get<UserResponse>('/api/user'));
      this.currentUser.set(data);
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
    this.currentUser.set(data);
    return data;
  }

  async register(input: RegisterInput): Promise<User> {
    await firstValueFrom(this.http.get('/sanctum/csrf-cookie'));
    const { data } = await firstValueFrom(this.http.post<UserResponse>('/auth/register', input));
    this.currentUser.set(data);
    return data;
  }

  /** Cuenta temporal de "Probar demo" (2 h, con datos de ejemplo). */
  async startDemo(): Promise<User> {
    await firstValueFrom(this.http.get('/sanctum/csrf-cookie'));
    const { data } = await firstValueFrom(this.http.post<UserResponse>('/auth/demo', {}));
    this.currentUser.set(data);
    return data;
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
