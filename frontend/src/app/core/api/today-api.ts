import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Today } from '../models/routine';

@Injectable({ providedIn: 'root' })
export class TodayApi {
  private readonly http = inject(HttpClient);

  /** `day`: hacer hoy otro día de la rutina activa (sin cambiar la rutina). */
  async get(day?: number): Promise<Today> {
    const options = day ? { params: { day } } : {};
    return (await firstValueFrom(this.http.get<{ data: Today }>('/api/today', options))).data;
  }
}
