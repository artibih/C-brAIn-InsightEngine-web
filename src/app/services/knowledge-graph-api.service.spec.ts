import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth/auth.service';
import { KnowledgeGraphApiService } from './knowledge-graph-api.service';

describe('KnowledgeGraphApiService', () => {
  let service: KnowledgeGraphApiService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/KnowledgeGraph`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        KnowledgeGraphApiService,
        {
          provide: AuthService,
          useValue: {
            getValidAccessToken: () => Promise.resolve('test-token'),
            getAccessToken: () => 'test-token',
          },
        },
      ],
    });

    service = TestBed.inject(KnowledgeGraphApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('search sends q + limit', () => {
    service.search('amyloid', undefined, 15).subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/search` &&
      r.params.get('q') === 'amyloid' &&
      r.params.get('limit') === '15'
    );
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { query: 'amyloid', results: [] } });
  });

  it('getNode passes id as query param', () => {
    service.getNode('n-1').subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/node` && r.params.get('id') === 'n-1'
    );
    req.flush({ success: true, data: null });
  });

  it('getNeighbors passes depth, limit, rel_types', () => {
    service.getNeighbors('n-1', { depth: 2, limit: 100, relTypes: 'SUPPORTS,CONTRADICTS' }).subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/neighbors` &&
      r.params.get('id') === 'n-1' &&
      r.params.get('depth') === '2' &&
      r.params.get('limit') === '100' &&
      r.params.get('rel_types') === 'SUPPORTS,CONTRADICTS'
    );
    req.flush({ success: true, data: { nodes: [], edges: [] } });
  });

  it('getSubgraph joins seeds with comma', () => {
    service.getSubgraph(['a', 'b', 'c'], { depth: 2 }).subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/subgraph` &&
      r.params.get('seeds') === 'a,b,c' &&
      r.params.get('depth') === '2'
    );
    req.flush({ success: true, data: { nodes: [], edges: [] } });
  });

  it('getPath uses snake_case query params', () => {
    service.getPath('from-1', 'to-1', 3).subscribe();
    const req = http.expectOne(r =>
      r.url === `${base}/paths` &&
      r.params.get('from_id') === 'from-1' &&
      r.params.get('to_id') === 'to-1' &&
      r.params.get('max_depth') === '3'
    );
    req.flush({ success: true, data: { found: false, nodes: [], edges: [] } });
  });

  it('getNodesBatch posts ids', () => {
    service.getNodesBatch(['a', 'b']).subscribe();
    const req = http.expectOne(`${base}/nodes/batch`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ids: ['a', 'b'] });
    req.flush({ success: true, data: { nodes: [] } });
  });

  it('export posts node_ids (snake_case)', () => {
    service.export(['a', 'b']).subscribe();
    const req = http.expectOne(`${base}/export`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ node_ids: ['a', 'b'] });
    req.flush({ success: true, data: { nodes: [], edges: [] } });
  });

  it('getSchema + getStats hit their paths', () => {
    service.getSchema().subscribe();
    const req1 = http.expectOne(`${base}/schema`);
    req1.flush({ success: true, data: { labels: [], relationship_types: [], ontology_relationship_types: [], searchable_labels: [], label_display_fields: {} } });

    service.getStats().subscribe();
    const req2 = http.expectOne(`${base}/stats`);
    req2.flush({ success: true, data: { node_total: 0, relationship_total: 0, nodes_by_label: {}, relationships_by_type: {} } });
  });
});
