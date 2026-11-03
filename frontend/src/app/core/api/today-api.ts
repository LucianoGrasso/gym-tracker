import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Today } from '../models/routine';

@Injectable({ providedIn: 'root' })
export class TodayApi {
  private readonly http = inject(HttpClient);

  async get(): Promise<Today> {
    return (await firstValueFrom(this.http.get<{ data: Today }>('/api/today'))).data;
  }
}
