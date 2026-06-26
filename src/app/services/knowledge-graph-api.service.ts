import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth/auth.service';
import { ApiResponse } from '../models/api-response.model';
import {
  GraphNode,
  GraphSchema,
  GraphStats,
  PathResponse,
  PathsStreamEvent,
  SearchResponse,
  SubgraphResponse,
} from '../models/knowledge-graph.models';
import { readSseStream } from '../features/knowledge-graph/sse-parser';


export interface NodeBatchRequest { ids: string[]; }
export interface ExportRequest { node_ids: string[]; }
export interface NodeBatchResponse { nodes: GraphNode[]; }

export interface NeighborsOptions {
  depth?: number;
  limit?: number;
  relTypes?: string;
}

export interface SubgraphOptions {
  depth?: number;
  limit?: number;
  relTypes?: string;
}

@Injectable({ providedIn: 'root' })
export class KnowledgeGraphApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private readonly base = `${environment.apiBaseUrl}/KnowledgeGraph`;

  search(
    q: string,
    label?: string,
    limit = 20,
    offset = 0,
  ): Observable<ApiResponse<SearchResponse>> {
    let params = new HttpParams()
      .set('q', q)
      .set('limit', String(limit))
      .set('offset', String(offset));
    if (label) params = params.set('label', label);
    return this.http.get<ApiResponse<SearchResponse>>(`${this.base}/search`, { params });
  }

  getNode(id: string): Observable<ApiResponse<GraphNode>> {
    const params = new HttpParams().set('id', id);
    return this.http.get<ApiResponse<GraphNode>>(`${this.base}/node`, { params });
  }

  getNodesBatch(ids: string[]): Observable<ApiResponse<NodeBatchResponse>> {
    const body: NodeBatchRequest = { ids };
    return this.http.post<ApiResponse<NodeBatchResponse>>(`${this.base}/nodes/batch`, body);
  }

  getNeighbors(id: string, opts: NeighborsOptions = {}): Observable<ApiResponse<SubgraphResponse>> {
    let params = new HttpParams()
      .set('id', id)
      .set('depth', String(opts.depth ?? 1))
      .set('limit', String(opts.limit ?? 50));
    if (opts.relTypes) params = params.set('rel_types', opts.relTypes);
    return this.http.get<ApiResponse<SubgraphResponse>>(`${this.base}/neighbors`, { params });
  }

  getSubgraph(seeds: string[], opts: SubgraphOptions = {}): Observable<ApiResponse<SubgraphResponse>> {
    let params = new HttpParams()
      .set('seeds', seeds.join(','))
      .set('depth', String(opts.depth ?? 1))
      .set('limit', String(opts.limit ?? 200));
    if (opts.relTypes) params = params.set('rel_types', opts.relTypes);
    return this.http.get<ApiResponse<SubgraphResponse>>(`${this.base}/subgraph`, { params });
  }

  getPath(fromId: string, toId: string, maxDepth = 4): Observable<ApiResponse<PathResponse>> {
    const params = new HttpParams()
      .set('from_id', fromId)
      .set('to_id', toId)
      .set('max_depth', String(maxDepth));
    return this.http.get<ApiResponse<PathResponse>>(`${this.base}/paths`, { params });
  }

  export(nodeIds: string[]): Observable<ApiResponse<SubgraphResponse>> {
    const body: ExportRequest = { node_ids: nodeIds };
    return this.http.post<ApiResponse<SubgraphResponse>>(`${this.base}/export`, body);
  }

  getSchema(): Observable<ApiResponse<GraphSchema>> {
    return this.http.get<ApiResponse<GraphSchema>>(`${this.base}/schema`);
  }

  getStats(): Observable<ApiResponse<GraphStats>> {
    return this.http.get<ApiResponse<GraphStats>>(`${this.base}/stats`);
  }

  



  streamPaths(
    fromId: string,
    toId: string,
    maxDepth = 4,
    limit = 20
  ): Observable<PathsStreamEvent> {
    return new Observable((observer: Observer<PathsStreamEvent>) => {
      const abort = new AbortController();

      (async () => {
        const token = await this.auth.getValidAccessToken();
        const params = new URLSearchParams({
          from_id: fromId,
          to_id: toId,
          max_depth: String(maxDepth),
          limit: String(limit),
        });

        try {
          const response = await fetch(`${this.base}/paths/stream?${params}`, {
            method: 'GET',
            headers: {
              Authorization: token ? `Bearer ${token}` : '',
              Accept: 'text/event-stream',
            },
            signal: abort.signal,
          });

          if (!response.ok || !response.body) {
            observer.error(new Error(`Paths stream failed with ${response.status}`));
            return;
          }

          for await (const frame of readSseStream(response.body)) {
            if (frame.event === 'path') {
              observer.next({ kind: 'path', path: JSON.parse(frame.data) });
            } else if (frame.event === 'done') {
              const body = frame.data ? JSON.parse(frame.data) : { total: 0 };
              observer.next({ kind: 'done', total: body.total ?? 0 });
              observer.complete();
              return;
            } else if (frame.event === 'error') {
              let message = frame.data || 'stream error';
              try {
                const parsed = JSON.parse(frame.data);
                if (parsed?.message) message = parsed.message;
              } catch {  }
              observer.next({ kind: 'error', message });
            }
          }

          observer.complete();
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            observer.error(err);
          }
        }
      })();

      return () => abort.abort();
    });
  }
}
