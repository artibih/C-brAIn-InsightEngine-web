import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ChangePasswordPayload } from '../models/change-password.model';
import { AppUserDto } from '../models/user.model';
import { PagedResult } from '../models/paged-result.model';
import { map } from 'rxjs/operators';


@Injectable({ providedIn: 'root' })
export class AccountService {
  private http = inject(HttpClient);

  private readonly url = `${environment.authApiBaseUrl}/Accounts/change-password`;
  private readonly usersUrl = `${environment.authApiBaseUrl}/Users`;

  changePassword(payload: ChangePasswordPayload): Observable<string> {
    return this.http.post(this.url, payload, {
      responseType: 'text',
    });
  }

  getUsers(page = 1, pageSize = 20, search = ''): Observable<PagedResult<AppUserDto>> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    if (search.trim()) {
      params = params.set('search', search.trim());
    }
    return this.http.get<any>(this.usersUrl, { params }).pipe(
      map(res => this.extractPagedResult(res, pageSize))
    );
  }

  getAllUsers(): Observable<AppUserDto[]> {
    return this.http.get<any>(this.usersUrl, { params: { page: '1', pageSize: '1000' } }).pipe(
      map(res => {
        const paged = this.extractPagedResult(res, 1000);
        return paged.items;
      })
    );
  }

  private extractPagedResult(res: any, fallbackPageSize: number): PagedResult<AppUserDto> {
    
    const raw = (res?.data?.items && Array.isArray(res.data.items)) ? res.data : res;

    if (raw?.items && Array.isArray(raw.items)) {
      
      return {
        items: raw.items,
        pageNumber: raw.pageNumber ?? raw.page ?? 1,
        pageSize: raw.pageSize ?? fallbackPageSize,
        totalCount: raw.totalCount ?? raw.total ?? raw.count ?? raw.items.length,
        totalPages: raw.totalPages ?? raw.pages ?? Math.ceil((raw.totalCount ?? raw.total ?? raw.count ?? raw.items.length) / (raw.pageSize ?? fallbackPageSize)),
        hasNext: raw.hasNext ?? raw.hasNextPage ?? false,
        hasPrevious: raw.hasPrevious ?? raw.hasPreviousPage ?? false,
      };
    }

    
    const items = Array.isArray(res) ? res : [];
    return { items, pageNumber: 1, pageSize: fallbackPageSize, totalCount: items.length, totalPages: 1, hasNext: false, hasPrevious: false };
  }


  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.usersUrl}/${id}`);
  }

  confirmEmail(id: number): Observable<any> {
    return this.http.post(`${this.usersUrl}/${id}/confirm-email`, {});
  }

  updateRoles(id: number, roles: string[]): Observable<void> {
    return this.http.put<void>(`${this.usersUrl}/${id}/roles`, { roles });
  }
}
