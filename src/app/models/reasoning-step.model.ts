export interface ReasoningStep {
  index: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
}
