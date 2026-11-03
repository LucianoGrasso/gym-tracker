import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.user() === undefined ? await auth.loadUser() : auth.user();

  return user ? true : router.createUrlTree(['/login']);
};
