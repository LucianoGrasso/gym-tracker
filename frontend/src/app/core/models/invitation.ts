export const MAX_PENDING_INVITATIONS = 5;

export interface Invitation {
  id: number;
  expires_at: string;
  /** Fecha de vencimiento en America/Santiago (aaaa-mm-dd). */
  expires_on: string;
}

export interface CreatedInvitation extends Invitation {
  /** Solo viene al crearla: con él se arma el link. */
  token: string;
}

export interface InvitationPreview {
  inviter_name: string;
  expires_at: string;
}
