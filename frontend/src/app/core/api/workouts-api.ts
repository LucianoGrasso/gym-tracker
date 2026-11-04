import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Paginated } from '../models/exercise';
import type { WorkoutDetail, WorkoutSummary } from '../models/workout';

@Injectable({ providedIn: 'root' })
export class WorkoutsApi {
  private readonly http = inject(HttpClient);

  list(page = 1): Promise<Paginated<WorkoutSummary>> {
    const params = new HttpParams().set('page', page);
    return firstValueFrom(this.http.get<Paginated<WorkoutSummary>>('/api/workouts', { params }));
  }

  async get(id: string): Promise<WorkoutDetail> {
    return (await firstValueFrom(this.http.get<{ data: WorkoutDetail }>(`/api/workouts/${id}`))).data;
  }
}
