import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  BodyweightSeries,
  Consistency,
  ExerciseStats,
  StatsOverview,
  StatsPeriod,
  WeeklyVolume,
} from '../models/stats';

@Injectable({ providedIn: 'root' })
export class StatsApi {
  private readonly http = inject(HttpClient);

  exercise(id: number, period: StatsPeriod): Promise<ExerciseStats> {
    return this.get(`/api/stats/exercises/${id}`, period);
  }

  overview(period: StatsPeriod): Promise<StatsOverview> {
    return this.get('/api/stats/overview', period);
  }

  weeklyVolume(period: StatsPeriod): Promise<WeeklyVolume> {
    return this.get('/api/stats/weekly-volume', period);
  }

  consistency(period: StatsPeriod): Promise<Consistency> {
    return this.get('/api/stats/consistency', period);
  }

  bodyweight(period: StatsPeriod): Promise<BodyweightSeries> {
    return this.get('/api/stats/bodyweight', period);
  }

  private async get<T>(url: string, period: StatsPeriod): Promise<T> {
    const params = new HttpParams().set('period', period);
    return (await firstValueFrom(this.http.get<{ data: T }>(url, { params }))).data;
  }
}
