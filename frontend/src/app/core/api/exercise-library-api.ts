import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Exercise } from '../models/exercise';
import type { LibraryExercise } from '../models/library';

interface Data<T> {
  data: T;
}

@Injectable({ providedIn: 'root' })
export class ExerciseLibraryApi {
  private readonly http = inject(HttpClient);

  async list(): Promise<LibraryExercise[]> {
    return (await firstValueFrom(this.http.get<Data<LibraryExercise[]>>('/api/exercise-library'))).data;
  }

  /** Pasa un ejercicio de la biblioteca a "Mis ejercicios" (o devuelve el que ya existe). */
  async adopt(slug: string): Promise<Exercise> {
    return (await firstValueFrom(this.http.post<Data<Exercise>>('/api/exercises/from-library', { slug }))).data;
  }
}
