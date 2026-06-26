import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { ADMIN_ROLE } from '../../constants/roles.constants';

export const AdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.decodedToken$.pipe(
    take(1),
    map(t => {
      if (t?.role !== ADMIN_ROLE) {
        router.navigate(['/']);
        return false;
      }
      return true;
    })
  );
};
