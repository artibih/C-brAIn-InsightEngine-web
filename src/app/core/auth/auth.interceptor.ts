import { Injectable, inject } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import {environment} from '../../../environments/environment';


@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private auth = inject(AuthService);

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const isApiCall =
      req.url.startsWith(environment.apiBaseUrl) ||
      req.url.startsWith(environment.authApiBaseUrl);

    let modified = req;

    const token = this.auth.getAccessToken();
    if (isApiCall && token) {
      modified = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    return next.handle(modified).pipe(
      catchError(err => {
        const isRefreshRequest = req.url.includes('/tokens/refresh-token');
        if (err.status === 401 && token && !isRefreshRequest) {
          return this.auth.refreshToken().pipe(
            switchMap(res => {
              const newReq = modified.clone({
                setHeaders: { Authorization: `Bearer ${res.token}` },
              });
              return next.handle(newReq);
            }),
            catchError(refreshErr => {

              return throwError(() => refreshErr);
            })
          );
        }
        return throwError(() => err);
      })
    );
  }
}

export const authInterceptorProvider = {
  provide: HTTP_INTERCEPTORS,
  useClass: AuthInterceptor,
  multi: true,
};
