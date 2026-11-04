import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BodyMetricsApi {
  private readonly http = inject(HttpClient);

  /** Guarda (o corrige) el peso corporal de una fecha "aaaa-mm-dd". */
  async save(date: string, bodyweightKg: number): Promise<void> {
    await firstValueFrom(this.http.put(`/api/body-metrics/${date}`, { bodyweight_kg: bodyweightKg }));
  }
}
