import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OrganizationOption {
  id: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private http = inject(HttpClient);

  getOrganizations(): Observable<OrganizationOption[]> {
    return this.http.get<OrganizationOption[]>(
      `${environment.authApiBaseUrl}/Organization/public-list`
    );
  }
}
