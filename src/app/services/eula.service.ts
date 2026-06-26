import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, combineLatest, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth/auth.service';
import { EULA_VERSION, EulaAcknowledgments } from '../constants/eula.constants';

@Injectable({ providedIn: 'root' })
export class EulaService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private readonly endpoint = `${environment.authApiBaseUrl}/Accounts/accept-eula`;
  private readonly storagePrefix = `${environment.appVersion}-EULA`;

  private readonly _needsAcceptance = signal(false);
  readonly needsAcceptance = this._needsAcceptance.asReadonly();

  constructor() {
    combineLatest([this.auth.isAuthenticated$, this.auth.userProfile$]).subscribe(
      ([isAuth, profile]) => this.evaluate(isAuth, profile),
    );
  }

  private evaluate(isAuth: boolean, profile: { loaded: boolean; data: any | null }): void {
    if (!isAuth) {
      this._needsAcceptance.set(false);
      return;
    }

    if (this.localAccepted(this.currentEmail())) {
      this._needsAcceptance.set(false);
      return;
    }

    if (!profile.loaded) {
      return;
    }

    const serverVersion = this.extractServerVersion(profile.data);
    this._needsAcceptance.set(serverVersion !== EULA_VERSION);
  }

  accept(acknowledgments: EulaAcknowledgments): Observable<void> {
    const email = this.currentEmail();
    const body = { version: EULA_VERSION, acknowledgments };

    return this.http.post(this.endpoint, body).pipe(
      catchError((err) => {
        if (this.isEndpointMissing(err?.status)) {
          return of(null);
        }
        return throwError(() => err);
      }),
      tap(() => {
        this.storeLocal(email);
        this._needsAcceptance.set(false);
      }),
      map(() => void 0),
    );
  }

  private extractServerVersion(data: any): string | null {
    if (!data) return null;
    return (
      data.acceptedEulaVersion ??
      data.user?.acceptedEulaVersion ??
      data.data?.acceptedEulaVersion ??
      null
    );
  }

  private isEndpointMissing(status?: number): boolean {
    return status === 0 || status === 404 || status === 405 || status === 501;
  }

  private currentEmail(): string {
    const token = this.auth.getDecodedToken();
    return (token?.unique_name ?? token?.email ?? '').toLowerCase();
  }

  private storageKey(email: string): string {
    return `${this.storagePrefix}:${email}`;
  }

  private localAccepted(email: string): boolean {
    if (!email) return false;
    try {
      return localStorage.getItem(this.storageKey(email)) === EULA_VERSION;
    } catch {
      return false;
    }
  }

  private storeLocal(email: string): void {
    if (!email) return;
    try {
      localStorage.setItem(this.storageKey(email), EULA_VERSION);
    } catch {
    }
  }
}
