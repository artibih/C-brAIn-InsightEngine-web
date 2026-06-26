import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { PreferencesDto } from '../models/preferences.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private http = inject(HttpClient);

  private readonly prefsSubject = new BehaviorSubject<PreferencesDto | null>(null);
  readonly preferences$ = this.prefsSubject.asObservable();

  private readonly url = `${environment.apiBaseUrl}/preferences`;

  load(): Observable<PreferencesDto> {
    return this.http.get<ApiResponse<PreferencesDto>>(this.url).pipe(
      map((res) => {
        if (!res?.success) {
          throw new Error(res?.message ?? 'Failed to load preferences.');
        }
        if (!res?.data) {
          throw new Error('Preferences payload is empty.');
        }
        return res.data;
      }),
      tap((prefs) => this.prefsSubject.next(prefs))
    );
  }

  update(prefs: PreferencesDto): Observable<PreferencesDto> {
    return this.http.put<ApiResponse<PreferencesDto>>(this.url, prefs).pipe(
      map((res) => {
        if (!res?.success) {
          throw new Error(res?.message ?? 'Failed to update preferences.');
        }
        if (!res?.data) {
          throw new Error('Preferences payload is empty.');
        }
        return res.data;
      }),
      tap((updated) => this.prefsSubject.next(updated))
    );
  }

  get snapshot(): PreferencesDto | null {
    return this.prefsSubject.value;
  }
}
