import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FeedbackPayload, PagedFeedback } from '../models/feedback.model';
import { ApiResponse } from '../models/api-response.model';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private http = inject(HttpClient);

  submitFeedback(payload: FeedbackPayload): Observable<boolean> {
    return this.http.post<void>(`${environment.apiBaseUrl}/feedback`, payload).pipe(map(() => true));
  }

  getMyFeedback(pageNumber = 1, pageSize = 20): Observable<ApiResponse<PagedFeedback>> {
    const params = new HttpParams()
      .set('pageNumber', pageNumber)
      .set('pageSize', pageSize);
    return this.http.get<ApiResponse<PagedFeedback>>(`${environment.apiBaseUrl}/feedback/my`, { params });
  }

  getAllFeedback(pageNumber = 1, pageSize = 20): Observable<ApiResponse<PagedFeedback>> {
    const params = new HttpParams()
      .set('pageNumber', pageNumber)
      .set('pageSize', pageSize);
    return this.http.get<ApiResponse<PagedFeedback>>(`${environment.apiBaseUrl}/feedback/admin`, { params });
  }
}
