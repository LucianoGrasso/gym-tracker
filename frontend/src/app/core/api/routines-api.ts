import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import type {
  Routine,
  RoutineDay,
  RoutineDayExercise,
  RoutineDayExerciseInput,
  RoutineDayExerciseTargets,
} from '../models/routine';

interface Data<T> {
  data: T;
}

export interface RoutineInput {
  name: string;
  notes: string | null;
}

export interface RoutineDayInput {
  name: string;
  weekday: number | null;
}

@Injectable({ providedIn: 'root' })
export class RoutinesApi {
  private readonly http = inject(HttpClient);

  private async data<T>(request: Observable<unknown>): Promise<T> {
    return ((await firstValueFrom(request)) as Data<T>).data;
  }

  list(): Promise<Routine[]> {
    return this.data(this.http.get('/api/routines'));
  }

  get(id: number): Promise<Routine> {
    return this.data(this.http.get(`/api/routines/${id}`));
  }

  create(input: RoutineInput): Promise<Routine> {
    return this.data(this.http.post('/api/routines', input));
  }

  update(id: number, input: RoutineInput): Promise<Routine> {
    return this.data(this.http.put(`/api/routines/${id}`, input));
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/routines/${id}`));
  }

  activate(id: number): Promise<Routine> {
    return this.data(this.http.post(`/api/routines/${id}/activate`, {}));
  }

  createDay(routineId: number, input: RoutineDayInput): Promise<RoutineDay> {
    return this.data(this.http.post(`/api/routines/${routineId}/days`, input));
  }

  updateDay(dayId: number, input: RoutineDayInput): Promise<RoutineDay> {
    return this.data(this.http.put(`/api/routine-days/${dayId}`, input));
  }

  async removeDay(dayId: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/routine-days/${dayId}`));
  }

  async reorderDays(routineId: number, ids: number[]): Promise<void> {
    await firstValueFrom(this.http.put(`/api/routines/${routineId}/days/reorder`, { ids }));
  }

  duplicateDay(dayId: number): Promise<RoutineDay> {
    return this.data(this.http.post(`/api/routine-days/${dayId}/duplicate`, {}));
  }

  addExercise(dayId: number, input: RoutineDayExerciseInput): Promise<RoutineDayExercise> {
    return this.data(this.http.post(`/api/routine-days/${dayId}/exercises`, input));
  }

  updateExercise(id: number, targets: RoutineDayExerciseTargets): Promise<RoutineDayExercise> {
    return this.data(this.http.put(`/api/routine-day-exercises/${id}`, targets));
  }

  async removeExercise(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/routine-day-exercises/${id}`));
  }

  async reorderExercises(dayId: number, ids: number[]): Promise<void> {
    await firstValueFrom(this.http.put(`/api/routine-days/${dayId}/exercises/reorder`, { ids }));
  }
}
