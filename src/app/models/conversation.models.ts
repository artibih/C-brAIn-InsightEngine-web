export type Provider = 'gemini' | 'openai' | 'perplexity';

export interface IndividualResponse {
  provider: Provider;
  content: string;
}

export interface UserMessage {
  content: string;
  timestamp: Date;
  attachments?: any[];
}

export interface Citation {
  id: string;
  index: number;
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  doi?: string;
  pubmedId?: string;
  abstract?: string;
  relevanceScore?: number;
  internalPdfUrl?: string;
  url?: string;
  paperUrl?: string;
  highlightText?: string;
  highlightPage?: number;
  sourceType?: 'pdf' | 'web' | 'pubmed' | 'doi';
}

export interface AgentStep {
  agent: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
  timestamp: Date;
  data?: any;
  stepId?: string;
  stepText?: string;
}

export interface ParsedTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface StepImage {
  url: string;
  label: string;
}

export interface HypothesisAnalysisStep {
  stepId: string;
  agent: string;
  task: string;
  description: string;
  rationale: string;
  expectedOutput: string;
  status: 'pending' | 'running' | 'completed';
  result?: string[];
  imageUrl?: string;
  imageUrls?: StepImage[];
  structuredResults?: ParsedTable[];
  rawKeyValues?: { key: string; value: string }[];
  strengths?: string[];
  validationSummary?: string;
}

export interface HypothesisPlan {
  hypothesis: string;
  objective: string;
  executionLogs: string[];
  methodologyChecks: string[];
  analysisSteps: HypothesisAnalysisStep[];
  validationCriteria: string[];
}

export interface RagChunk {
  content: string;
  paperId?: string;
  doi?: string;
  title?: string;
  authors?: string[];
  abstract?: string;
  paperUrl?: string;
}

export interface RagResponse {
  answer: string;
  chunks: RagChunk[];
}

export interface StreamError {
  title: string;
  message: string;
  code?: string;
  canRetry: boolean;
}

export interface ReviewerAgentOutput {
  agent: string;
  output: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    methodological_issues?: string[];
    technical_concerns?: string[];
    recommendation: string;
  };
}

export interface FinalReview {
  consensus: string;
  disagreements: string;
  key_risks: string[];
  final_recommendation: string;
  justification: string;
}

export interface BenchmarkClaim {
  claim_id?: string;
  claim: string;
  reason?: string;
  evidence?: string;
}

export interface BenchmarkReplicationFinding {
  topic: string;
  evidence_from_graph: string;
  agreement: string;
}


export interface ReviewerBenchmarkOutput {
  agent: string;
  output: {
    summary: string;
    evidence_grounding: string;
    supported_claims?: BenchmarkClaim[];
    unsubstantiated_claims?: BenchmarkClaim[];
    contradicted_claims?: BenchmarkClaim[];
    replication_findings?: BenchmarkReplicationFinding[];
    strengths: string[];
    weaknesses: string[];
    recommendation: string;
  };
}

export interface ReviewerOutput {
  review_journal_editor?: ReviewerAgentOutput;
  review_methodological?: ReviewerAgentOutput;
  review_domain_expert?: ReviewerAgentOutput;
  review_benchmark_evidence?: ReviewerBenchmarkOutput;
  final_review?: FinalReview;
}

export interface CombinedResponse {
  id: string;
  userMessage: UserMessage;
  synthesizedResponse: string;
  individualResponses: IndividualResponse[];
  conflictingInformation?: string;
  timestamp: Date;
  isStreaming?: boolean;
  citations?: Citation[];
  activeAgentName?: string;
  activeAgentMessage?: string;
  agentSteps?: AgentStep[];
  ragResponse?: RagResponse;
  reviewerOutput?: ReviewerOutput;
  streamSource?: 'assistant' | 'rag' | 'reviewer';
  chatMode?: any;
  streamError?: StreamError;
  assistantMessageId?: string;
  rating?: number;
  feedbackComment?: string;
}

export interface SavedConversation {
  id: string;
  title: string;
  timestamp: Date;
  combinedResponses: CombinedResponse[];
  messageCount?: number;
  isDraft?: boolean;
  mode?: 'rag' | 'chat' | 'reviewer';
  projectId?: string | null;
  isStreaming?: boolean;
}
