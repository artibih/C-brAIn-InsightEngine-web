
export type ReviewerParamKey = 'tone' | 'depth' | 'persona';

export interface ReviewerParamOption {
  readonly value: string;
  readonly label: string;
  readonly effect: string;
}

export interface ReviewerParameters {
  readonly tone: string;
  readonly depth: string;
  readonly persona: string;
}

export const DEFAULT_REVIEWER_PARAMETERS: ReviewerParameters = {
  tone: 'neutral',
  depth: 'detailed',
  persona: 'scientific_rigor_focus',
};

export interface ReviewerParameterOptions {
  readonly defaults: ReviewerParameters;
  readonly toneOptions: readonly ReviewerParamOption[];
  readonly depthOptions: readonly ReviewerParamOption[];
  readonly personaOptions: readonly ReviewerParamOption[];
}

export interface ReviewerParamGroup {
  readonly key: ReviewerParamKey;
  readonly label: string;
  readonly icon: string;
}

export const REVIEWER_PARAM_GROUPS: readonly ReviewerParamGroup[] = [
  { key: 'tone', label: 'Tone', icon: 'bi-chat-square-quote' },
  { key: 'depth', label: 'Depth', icon: 'bi-layers-half' },
] as const;
