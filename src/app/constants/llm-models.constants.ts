

export type LlmProvider = 'openai' | 'mistral' | 'llama' | 'deepseek';


export interface LlmModel {
  readonly provider: LlmProvider;
  readonly modelKey: string;
  readonly displayName: string;
  readonly shortName: string;
  readonly icon: string;
}

export interface LlmSelection {
  readonly provider: string;
  readonly model_key: string;
}

export const LLM_MODELS: readonly LlmModel[] = [
  {
    provider: 'openai',
    modelKey: 'azure-openai-gpt-4.1',
    displayName: 'OpenAI GPT-4.1',
    shortName: 'GPT-4.1',
    icon: 'bi-stars',
  },
  {
    provider: 'mistral',
    modelKey: 'Mistral-Large-3',
    displayName: 'Mistral Large 3',
    shortName: 'Mistral Large 3',
    icon: 'bi-wind',
  },
  {
    provider: 'llama',
    modelKey: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
    displayName: 'Llama 4 Maverick 17B 128E Instruct FP8',
    shortName: 'Llama 4 Maverick',
    icon: 'bi-meta',
  },
  {
    provider: 'deepseek',
    modelKey: 'DeepSeek-V4-Pro',
    displayName: 'DeepSeek V4 Pro',
    shortName: 'DeepSeek V4 Pro',
    icon: 'bi-water',
  },
] as const;

export const DEFAULT_LLM_MODEL: LlmModel = LLM_MODELS[0];

export function toLlmSelection(model: LlmModel): LlmSelection {
  return { provider: model.provider, model_key: model.modelKey };
}


export const DEFAULT_LLM_SELECTION: LlmSelection = toLlmSelection(DEFAULT_LLM_MODEL);
