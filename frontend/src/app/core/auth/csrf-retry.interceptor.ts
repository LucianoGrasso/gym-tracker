import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEventType,
  HttpInterceptorFn,
  HttpRequest,
  HttpXsrfTokenExtractor,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, filter, switchMap, take, throwError } from 'rxjs';

const RETRIED = new HttpContextToken<boolean>(() => false);

/**
 * Si Laravel responde 419 (token CSRF expirado), pide una cookie nueva y reintenta una vez
 * con el token actualizado.
 */
export const csrfRetryInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(HttpXsrfTokenExtractor);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 419 || req.context.get(RETRIED)) {
        return throwError(() => error);
      }
      return next(new HttpRequest('GET', '/sanctum/csrf-cookie')).pipe(
        filter((event) => event.type === HttpEventType.Response),
        take(1),
        switchMap(() => {
          const token = tokens.getToken();
          return next(
            req.clone({
              context: req.context.set(RETRIED, true),
              setHeaders: token ? { 'X-XSRF-TOKEN': token } : {},
            }),
          );
        }),
      );
    }),
  );
};
