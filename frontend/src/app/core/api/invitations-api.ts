import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CreatedInvitation, Invitation, InvitationPreview } from '../models/invitation';

@Injectable({ providedIn: 'root' })
export class InvitationsApi {
  private readonly http = inject(HttpClient);

  async list(): Promise<Invitation[]> {
    return (await firstValueFrom(this.http.get<{ data: Invitation[] }>('/api/invitations'))).data;
  }

  async create(): Promise<CreatedInvitation> {
    return (await firstValueFrom(this.http.post<{ data: CreatedInvitation }>('/api/invitations', {}))).data;
  }

  async revoke(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/invitations/${id}`));
  }

  async preview(token: string): Promise<InvitationPreview> {
    const url = `/auth/invitations/${encodeURIComponent(token)}`;
    return (await firstValueFrom(this.http.get<{ data: InvitationPreview }>(url))).data;
  }
}
