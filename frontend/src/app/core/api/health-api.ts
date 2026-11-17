import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Token del Atajo "GymTracker Salud". */
@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);

  async createToken(): Promise<string> {
    const res = await firstValueFrom(this.http.post<{ data: { token: string } }>('/api/health-token', {}));
    return res.data.token;
  }

  async revokeToken(): Promise<void> {
    await firstValueFrom(this.http.delete('/api/health-token'));
  }
}
