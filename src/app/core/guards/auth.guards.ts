import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { HOME_ROUTE, UserRole } from '../models/user.model';

/** Requiere sesión iniciada con rol válido y estado ACTIVE. */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).currentUser$.pipe(
    take(1),
    map((user) => (user ? true : router.createUrlTree(['/login']))),
  );
};

/**
 * Experiencia de navegación por rol. La seguridad real está en las reglas de Firestore.
 */
export function roleGuard(...allowed: UserRole[]): CanActivateFn {
  return () => {
    const router = inject(Router);
    return inject(AuthService).currentUser$.pipe(
      take(1),
      map((user) => {
        if (!user) return router.createUrlTree(['/login']);
        return allowed.includes(user.role) ? true : router.createUrlTree([HOME_ROUTE]);
      }),
    );
  };
}

/** Para /login: si ya hay sesión, manda al dashboard. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).currentUser$.pipe(
    take(1),
    map((user) => (user ? router.createUrlTree([HOME_ROUTE]) : true)),
  );
};
