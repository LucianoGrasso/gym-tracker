import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CancelPushRequest, RestPushRequest } from '../models/push';

@Injectable({ providedIn: 'root' })
export class PushApi {
  private readonly http = inject(HttpClient);

  async publicKey(): Promise<string | null> {
    const res = await firstValueFrom(this.http.get<{ data: { public_key: string | null } }>('/api/push/config'));
    return res.data.public_key;
  }

  async token(endpoint: string): Promise<string> {
    const res = await firstValueFrom(
      this.http.post<{ data: { signature: string } }>('/api/push/token', { endpoint }),
    );
    return res.data.signature;
  }

  /** Lambda de push (fuera de Laravel). Devuelve el ID de la ejecución del temporizador. */
  async schedule(request: RestPushRequest): Promise<string> {
    return (await firstValueFrom(this.http.post<{ execution: string }>('/push/rest', request))).execution;
  }

  async cancel(request: CancelPushRequest): Promise<void> {
    await firstValueFrom(this.http.post('/push/cancel', request));
  }
}
