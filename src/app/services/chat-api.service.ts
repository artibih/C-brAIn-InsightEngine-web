import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PagedResult } from '../models/paged-result.model';
import { ChatMessageDto, ChatSessionItemDto, ConversationDto, MessageFeedbackRequest } from '../models/chat.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private http = inject(HttpClient);

  getMySessions(pageNumber = 1, pageSize = 20): Observable<ApiResponse<PagedResult<ChatSessionItemDto>>> {
    const url = `${environment.apiBaseUrl}/Chat/sessions/me`;
    return this.http.get<ApiResponse<PagedResult<ChatSessionItemDto>>>(url, {
      params: { pageNumber: pageNumber.toString(), pageSize: pageSize.toString() }
    });
  }

  getConversation(sessionId: string): Observable<ApiResponse<{ data: ConversationDto } | ConversationDto>> {
    const url = `${environment.apiBaseUrl}/Chat/${sessionId}/conversation`;
    return this.http.get<any>(url);
  }

  deleteSession(id: string): Observable<any> {
    return this.http.delete(`${environment.apiBaseUrl}/Chat/${id}`);
  }

  saveSession(sessionId: string): Observable<ApiResponse<unknown>> {
    const url = `${environment.apiBaseUrl}/Chat/${sessionId}/save`;
    return this.http.post<ApiResponse<unknown>>(url, null);
  }

  submitMessageFeedback(
    sessionId: string,
    messageId: string,
    rating: number,
    feedbackComment?: string,
  ): Observable<ApiResponse<ChatMessageDto>> {
    const url = `${environment.apiBaseUrl}/Chat/${sessionId}/messages/${messageId}/feedback`;
    const body: MessageFeedbackRequest = { rating };
    const trimmed = feedbackComment?.trim();
    if (trimmed) body.feedbackComment = trimmed;
    return this.http.post<ApiResponse<ChatMessageDto>>(url, body);
  }

  deleteMessageFeedback(
    sessionId: string,
    messageId: string,
  ): Observable<ApiResponse<ChatMessageDto>> {
    const url = `${environment.apiBaseUrl}/Chat/${sessionId}/messages/${messageId}/feedback`;
    return this.http.delete<ApiResponse<ChatMessageDto>>(url);
  }

  refineQuery(draftQuery: string): Observable<ApiResponse<string>> {
    const url = `${environment.apiBaseUrl}/Chat/refine-query`;
    return this.http.post<ApiResponse<string>>(url, { draftQuery });
  }

  downloadConversationDocx(id: string): Observable<HttpResponse<Blob>> {
    return this.http.get(
      `${environment.apiBaseUrl}/Chat/${id}/download/docx`,
      {
        observe: 'response',
        responseType: 'blob',
        headers: { Accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      }
    );
  }
}
