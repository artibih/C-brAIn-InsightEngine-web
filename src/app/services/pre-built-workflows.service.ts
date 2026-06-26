import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { PagedResult } from '../models/paged-result.model';
import { PreBuiltWorkflow } from '../models/pre-built-workflow.model';

@Injectable({ providedIn: 'root' })
export class PreBuiltWorkflowsService {
  private readonly http = inject(HttpClient);
  private readonly resourceUrl = `${environment.apiBaseUrl}/pre-built-workflows`;

  list(pageNumber = 1, pageSize = 50): Observable<ApiResponse<PagedResult<PreBuiltWorkflow>>> {
    const params = new HttpParams()
      .set('pageNumber', pageNumber.toString())
      .set('pageSize', pageSize.toString());
    return this.http.get<ApiResponse<PagedResult<PreBuiltWorkflow>>>(this.resourceUrl, { params });
  }

  getById(id: string): Observable<ApiResponse<PreBuiltWorkflow>> {
    return this.http.get<ApiResponse<PreBuiltWorkflow>>(`${this.resourceUrl}/${id}`);
  }
}
