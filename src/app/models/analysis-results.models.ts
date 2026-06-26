
export interface ArtifactImage {
  url: string;
  label: string;
  stepId?: string;
}

export interface StructuredTableRow {
  metric: string;
  value: string;
  pValue?: string;
  significant?: boolean;
}

export interface DynamicTable {
  title?: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface StatisticalResult {
  images: ArtifactImage[];
  tableRows: StructuredTableRow[];
  dynamicTables: DynamicTable[];
  summary?: string;
}

export interface FindingCitation {
  citationNumber: number;
  paperId?: string;
  doi?: string;
  doiUrl?: string;
  title?: string;
  authors?: string;
  abstract?: string;
  paperUrl?: string;
}

export interface SynthesizerFinding {
  detail: string;
  citations: FindingCitation[];
}

export interface CriticalResult {
  needsRevision: boolean;
  revisionAgents: string[];
  feedback: string;
  revisionCycle: number;
  issues: string[];
  strengths: string[];
  validationSummary: string;
}

export interface RevisionStatus {
  active: boolean;
  cycle: number;
  agents: string[];
}

export interface AgentStatusInfo {
  name: string;
  displayName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message: string;
}

export interface AnalysisViewModel {
  statistical: StatisticalResult | null;
  findings: SynthesizerFinding[];
  critical: CriticalResult | null;
  revision: RevisionStatus;
  agents: AgentStatusInfo[];
  hasAnyData: boolean;
}
