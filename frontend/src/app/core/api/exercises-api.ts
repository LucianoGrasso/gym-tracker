import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Exercise, ExerciseInput, ExerciseSession, MuscleGroup, Paginated } from '../models/exercise';

interface Data<T> {
  data: T;
}

export interface ExerciseFilters {
  search?: string;
  muscle_group?: MuscleGroup | null;
  archived?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ExercisesApi {
  private readonly http = inject(HttpClient);

  async list(filters: ExerciseFilters = {}): Promise<Exercise[]> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.muscle_group) params = params.set('muscle_group', filters.muscle_group);
    if (filters.archived) params = params.set('archived', '1');
    return (await firstValueFrom(this.http.get<Data<Exercise[]>>('/api/exercises', { params }))).data;
  }

  async get(id: number): Promise<Exercise> {
    return (await firstValueFrom(this.http.get<Data<Exercise>>(`/api/exercises/${id}`))).data;
  }

  async create(input: ExerciseInput): Promise<Exercise> {
    return (await firstValueFrom(this.http.post<Data<Exercise>>('/api/exercises', input))).data;
  }

  async update(id: number, input: ExerciseInput): Promise<Exercise> {
    return (await firstValueFrom(this.http.put<Data<Exercise>>(`/api/exercises/${id}`, input))).data;
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/exercises/${id}`));
  }

  async archive(id: number): Promise<Exercise> {
    return (await firstValueFrom(this.http.post<Data<Exercise>>(`/api/exercises/${id}/archive`, {}))).data;
  }

  async restore(id: number): Promise<Exercise> {
    return (await firstValueFrom(this.http.post<Data<Exercise>>(`/api/exercises/${id}/restore`, {}))).data;
  }

  history(id: number, page = 1): Promise<Paginated<ExerciseSession>> {
    const params = new HttpParams().set('page', page);
    return firstValueFrom(this.http.get<Paginated<ExerciseSession>>(`/api/exercises/${id}/history`, { params }));
  }
}
