import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toLogin = router.createUrlTree(['/login']);

  if (auth.user() !== undefined) {
    return auth.user() ? true : toLogin;
  }

  try {
    return (await auth.loadUser()) ? true : toLogin;
  } catch {
    // API caída o respuesta inválida (p. ej. la BD despertando): mejor mostrar el login,
    // que informa el error al intentar entrar, que dejar la navegación colgada en negro.
    return toLogin;
  }
};
