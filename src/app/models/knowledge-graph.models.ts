
export interface GraphNode {
  id: string;
  label?: string;
  properties: Record<string, unknown>;
  degree?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface TruncationInfo {
  nodes: boolean;
  hidden_neighbors: number;
}

export interface SubgraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated?: TruncationInfo | null;
}

export interface SearchHit {
  id: string;
  label: string;
  name: string;
  degree: number;
}

export interface SearchResponse {
  query: string;
  results: SearchHit[];
  total?: number;
  facets?: Record<string, number>;
  limit?: number;
  offset?: number;
}

export interface PathResponse {
  found: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  length?: number;
}

export interface GraphSchema {
  labels: string[];
  relationship_types: string[];
  ontology_relationship_types: string[];
  searchable_labels: string[];
  label_display_fields: Record<string, string>;
}

export interface GraphStats {
  node_total: number;
  relationship_total: number;
  nodes_by_label: Record<string, number>;
  relationships_by_type: Record<string, number>;
}

export interface StreamedPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  length: number;
}

export type PathsStreamEvent =
  | { kind: 'path'; path: StreamedPath }
  | { kind: 'done'; total: number }
  | { kind: 'error'; message: string };
