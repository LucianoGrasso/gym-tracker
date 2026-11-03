import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('returns the first validation error', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { message: 'x', errors: { name: ['Ya tienes un ejercicio con ese nombre.'] } },
    });
    expect(apiErrorMessage(error)).toBe('Ya tienes un ejercicio con ese nombre.');
  });
  it('returns the server message for conflicts', () => {
    const error = new HttpErrorResponse({ status: 409, error: { message: 'El ejercicio tiene historial.' } });
    expect(apiErrorMessage(error)).toBe('El ejercicio tiene historial.');
  });
  it('explains network failures', () => {
    expect(apiErrorMessage(new HttpErrorResponse({ status: 0 }))).toBe('No se pudo conectar. Intenta de nuevo.');
  });
  it('has a generic fallback', () => {
    expect(apiErrorMessage(new Error('boom'))).toBe('Ocurrió un error inesperado.');
    expect(apiErrorMessage(new HttpErrorResponse({ status: 500, error: '<html>' }))).toBe('Ocurrió un error inesperado.');
  });
});
