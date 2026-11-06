import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Routine } from '../models/routine';
import type { RoutineTemplate } from '../models/routine-template';

@Injectable({ providedIn: 'root' })
export class RoutineTemplatesApi {
  private readonly http = inject(HttpClient);
  /** El catálogo no cambia durante la sesión: se pide una vez (y se reintenta si falló). */
  private catalog: Promise<RoutineTemplate[]> | null = null;

  list(): Promise<RoutineTemplate[]> {
    this.catalog ??= firstValueFrom(this.http.get<{ data: RoutineTemplate[] }>('/api/routine-templates'))
      .then((r) => r.data)
      .catch((error: unknown) => {
        this.catalog = null;
        throw error;
      });
    return this.catalog;
  }

  async find(slug: string): Promise<RoutineTemplate | undefined> {
    return (await this.list()).find((t) => t.slug === slug);
  }

  async import(slug: string): Promise<Routine> {
    const response = await firstValueFrom(
      this.http.post<{ data: Routine }>(`/api/routine-templates/${slug}/import`, {}),
    );
    return response.data;
  }
}
