import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { UploadedFileDto } from '../models/uploading-file.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class FilesService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = environment.apiBaseUrl;
  private readonly resourceUrl = `${this.baseUrl}/Files`;

  private readonly signedUrlCache = new Map<string, string>();
  private readonly inflight = new Map<string, Observable<string>>();

  uploadFiles(files: File[]): Observable<UploadedFileDto[]> {
    const form = new FormData();

    for (const f of files) {
      form.append('files', f, f.name);
    }

    return this.http
      .post<ApiResponse<UploadedFileDto[]>>(this.resourceUrl, form)
      .pipe(map((res) => res.data ?? []));
  }

  getDownloadUrl(blobUrl: string): Observable<string> {
    const params = new HttpParams().set('blobUrl', blobUrl);
    return this.http
      .get<ApiResponse<string>>(`${this.resourceUrl}/download`, { params })
      .pipe(map((res) => res.data));
  }


  resolveUrl(url: string): Observable<string> {
    if (!url || !FilesService.isPrivateBlobUrl(url)) return of(url);

    const cached = this.signedUrlCache.get(url);
    if (cached) return of(cached);

    let req = this.inflight.get(url);
    if (req) return req;

    req = this.getDownloadUrl(url).pipe(
      tap((signed) => {
        this.signedUrlCache.set(url, signed);
        this.inflight.delete(url);
      }),
      catchError(() => {
        this.inflight.delete(url);
        return of(url);
      }),
      shareReplay(1),
    );

    this.inflight.set(url, req);
    return req;
  }


  static isPrivateBlobUrl(url: string | undefined | null): boolean {
    if (!url) return false;
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host.endsWith('.blob.core.windows.net');
    } catch {
      return false;
    }
  }
}
