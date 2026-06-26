import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import {BehaviorSubject, Observable, throwError, firstValueFrom, distinctUntilChanged} from 'rxjs';
import { catchError, finalize, map, mapTo, shareReplay, switchMap, tap, timeout } from 'rxjs/operators';
import { jwtDecode } from 'jwt-decode';
import {environment} from '../../../environments/environment';
import { ToastService } from '../../shared/toast/toast.service';



export interface AuthResponse {
  token: string;
  refreshToken: string;
  rememberMe?: boolean;
  message?: string;
}

export interface JwtPayload {
  sub?: string;
  email?: string;
  unique_name?: string;
  exp?: number;
  role?: string;
  given_name?: string;
  family_name?: string;
  firstName?: string;
  lastName?: string;
  organization?: string;
  [key: string]: any;
}
export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleId: string;
  organizationId?: number;
  organizationName?: string;
  justification?: string;
  acceptedEulaVersion?: string;
}


@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly storageKey = `${environment.appVersion}-AUTH`;
  readonly sessionStorageKey = `${environment.appVersion}-AUTH-SESSION`;

  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;
  private rememberMe = false;

  private refreshTokenInProgress$: Observable<AuthResponse> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  private isLoadingSubject = new BehaviorSubject<boolean>(false);
  isLoading$ = this.isLoadingSubject.asObservable();

  private decodedTokenSubject = new BehaviorSubject<JwtPayload | null>(null);
  decodedToken$ = this.decodedTokenSubject.asObservable();
  private _decodedToken: JwtPayload | null = null;
  readonly userEmail$ = this.decodedToken$.pipe(
    map(t => (t?.unique_name ?? t?.email ?? null))
  );

  private userNameSubject = new BehaviorSubject<string | null>(null);
  readonly userName$ = this.userNameSubject.asObservable();

  private userProfileSubject = new BehaviorSubject<{ loaded: boolean; data: any | null }>({
    loaded: false,
    data: null,
  });
  readonly userProfile$ = this.userProfileSubject.asObservable();

  readonly role$ = this.decodedToken$.pipe(
    map(t => this.extractRole(t)),
    distinctUntilChanged()
  );

  readonly isAdmin$ = this.role$.pipe(
    map(role => role === 'Admin'),
    distinctUntilChanged()
  );

  private readonly REFERENCE_ROLES = new Set(['Admin', 'SuperAdmin', 'CBrainUser', 'OrganizationAdmin']);

  readonly canAccessReferences$ = this.decodedToken$.pipe(
    map(t => {
      const role = this.extractRole(t);
      return role !== null && this.REFERENCE_ROLES.has(role);
    }),
    distinctUntilChanged()
  );

  private extractRole(t: JwtPayload | null): string | null {
    if (!t) return null;
    if (t.role) return t.role;
    const longClaim = t['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
    if (longClaim) return typeof longClaim === 'string' ? longClaim : Array.isArray(longClaim) ? longClaim[0] : null;
    return null;
  }

  hasRole(role: string): boolean {
    return this.extractRole(this._decodedToken) === role;
  }
  constructor() {
    const stored = this.getStoredAuth();
    if (stored?.token && stored.refreshToken) {
      this.accessToken = stored.token;
      this.refreshTokenValue = stored.refreshToken;
      this.rememberMe = stored.rememberMe || false;

      this.decodeToken(stored.token);

      const expMs = this._decodedToken?.exp ? this._decodedToken.exp * 1000 : null;
      const isExpired = expMs !== null ? expMs < Date.now() : true;

      this.isAuthenticatedSubject.next(!!this._decodedToken && !isExpired);
    }

  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getDecodedToken(): JwtPayload | null {
    return this._decodedToken;
  }

  private decodeToken(token: string | null): void {
    if (!token) {
      this._decodedToken = null;
      this.decodedTokenSubject.next(null);
      return;
    }

    try {
      const decoded = jwtDecode<JwtPayload>(token);
      this._decodedToken = decoded;
      this.decodedTokenSubject.next(decoded);
    } catch {
      this._decodedToken = null;
      this.decodedTokenSubject.next(null);
    }
  }

  async initialize(): Promise<void> {
    if (!this.getAccessToken()) return;

    const expMs = this._decodedToken?.exp ? this._decodedToken.exp * 1000 : null;
    const isExpired = expMs !== null ? expMs < Date.now() : true;

    if (isExpired) {
      try {
        await firstValueFrom(this.refreshToken());
        this.isAuthenticatedSubject.next(true);
        this.fetchUserProfile();
      } catch {
        this.logout(false);
      }
      return;
    }

    this.isAuthenticatedSubject.next(true);
    this.scheduleTokenRefresh();
    this.fetchUserProfile();
  }


  login(email: string, password: string, rememberMe = false): Observable<boolean> {
    this.isLoadingSubject.next(true);
    this.rememberMe = rememberMe;

    const url = `${environment.authApiBaseUrl}/Accounts/login`;

    return this.http
      .post<AuthResponse>(url, { emailAddress: email, password })
      .pipe(
        tap(resp => {
          this.accessToken = resp.token;
          this.refreshTokenValue = resp.refreshToken;
          this.rememberMe = rememberMe;
          this.decodeToken(resp.token);
          this.storeAuth({ ...resp, rememberMe });
        }),
        tap(() => {
          this.isAuthenticatedSubject.next(true);
          this.scheduleTokenRefresh();
          this.fetchUserProfile();
        }),
        map(() => true),
        catchError(err => throwError(() => err)),
        finalize(() => this.isLoadingSubject.next(false))
      );
  }

  logout(redirectToLogin: boolean = true): void {
    this.clearRefreshTimer();
    this.accessToken = this.refreshTokenValue = null;
    localStorage.removeItem(this.storageKey);
    sessionStorage.removeItem(this.sessionStorageKey);
    this.rememberMe = false;
    this.decodeToken(null);
    this.userNameSubject.next(null);
    this.userProfileSubject.next({ loaded: false, data: null });
    this.isAuthenticatedSubject.next(false);

    if (redirectToLogin) {
      this.router.navigate(['/auth']);
    }
  }

  private scheduleTokenRefresh(): void {
    this.clearRefreshTimer();

    const expMs = this._decodedToken?.exp ? this._decodedToken.exp * 1000 : null;
    if (!expMs) return;

    const refreshAt = expMs - Date.now() - 60_000;
    if (refreshAt <= 0) return;

    this.refreshTimer = setTimeout(() => {
      this.refreshToken().subscribe({
        error: () => {}
      });
    }, refreshAt);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  refreshToken(): Observable<AuthResponse> {
    if (this.refreshTokenInProgress$) {
      return this.refreshTokenInProgress$;
    }

    if (!this.refreshTokenValue) {
      this.logout();
      return throwError(() => new Error('No refresh token'));
    }

    const url = `${environment.authApiBaseUrl}/tokens/refresh-token`;

    this.refreshTokenInProgress$ = this.http
      .post<AuthResponse>(url, { refreshToken: this.refreshTokenValue })
      .pipe(
        timeout(10_000),
        tap(resp => {
          this.accessToken = resp.token;
          this.refreshTokenValue = resp.refreshToken;
          this.decodeToken(resp.token);
          this.storeAuth({ ...resp, rememberMe: this.rememberMe });
          this.scheduleTokenRefresh();
        }),
        catchError(err => {
          this.toast.error('Session expired, please log in again');
          this.logout();
          return throwError(() => err);
        }),
        shareReplay(1),
        finalize(() => (this.refreshTokenInProgress$ = null))
      );

    return this.refreshTokenInProgress$;
  }


  private storeAuth(auth: AuthResponse & { rememberMe?: boolean }): void {
    const data: any = { ...auth, rememberMe: this.rememberMe };
    if (this.rememberMe) {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      sessionStorage.removeItem(this.sessionStorageKey);
    } else {
      sessionStorage.setItem(this.sessionStorageKey, JSON.stringify(data));
      localStorage.removeItem(this.storageKey);
    }
  }

  private getStoredAuth(): AuthResponse & { rememberMe?: boolean } | null {
    let raw = localStorage.getItem(this.storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.rememberMe = parsed.rememberMe || false;
        return parsed;
      } catch {
        localStorage.removeItem(this.storageKey);
      }
    }

    raw = sessionStorage.getItem(this.sessionStorageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.rememberMe = parsed.rememberMe || false;
        return parsed;
      } catch {
        sessionStorage.removeItem(this.sessionStorageKey);
      }
    }

    return null;
  }

  updateTokens(auth: AuthResponse, persist = true): void {
    this.accessToken = auth.token;
    this.refreshTokenValue = auth.refreshToken;
    this.decodeToken(auth.token);
    if (persist) {
      this.storeAuth({ ...auth, rememberMe: this.rememberMe });
    }
  }

  register(payload: RegisterPayload): Observable<any> {
    this.isLoadingSubject.next(true);

    const url = `${environment.authApiBaseUrl}/Accounts/register`;

    return this.http.post(url, payload).pipe(
      mapTo(true),
      catchError(err => throwError(() => err)),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  fetchUserProfile(): void {
    const url = `${environment.authApiBaseUrl}/Auth/me`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        this.userProfileSubject.next({ loaded: true, data: res });
        const name = res?.user?.name;
        if (name) {
          this.userNameSubject.next(name);
        } else {
          const email = this._decodedToken?.unique_name || this._decodedToken?.email;
          this.userNameSubject.next(email ? email.split('@')[0] : null);
        }
      },
      error: () => {
        this.userProfileSubject.next({ loaded: true, data: null });
        const email = this._decodedToken?.unique_name || this._decodedToken?.email;
        this.userNameSubject.next(email ? email.split('@')[0] : null);
      }
    });
  }

  async getValidAccessToken(): Promise<string> {
    const token = this.getAccessToken();
    if (!token) return '';

    const expMs = this._decodedToken?.exp ? this._decodedToken.exp * 1000 : null;
    const isExpiredOrMissing = expMs === null || expMs <= Date.now() + 60_000;

    if (!isExpiredOrMissing) return token;

    try {
      await firstValueFrom(this.refreshToken());
      return this.getAccessToken() ?? '';
    } catch {
      return '';
    }
  }

}
