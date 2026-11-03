import { HttpErrorResponse } from '@angular/common/http';

/** Mensaje en español para mostrar al usuario a partir de un error de la API. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No se pudo conectar. Intenta de nuevo.';
    }
    const body = error.error as { message?: unknown; errors?: Record<string, string[]> } | null;
    if (error.status === 422 && body?.errors) {
      const first = Object.values(body.errors)[0]?.[0];
      if (first) {
        return first;
      }
    }
    if (error.status < 500 && typeof body?.message === 'string') {
      return body.message;
    }
  }
  return 'Ocurrió un error inesperado.';
}
