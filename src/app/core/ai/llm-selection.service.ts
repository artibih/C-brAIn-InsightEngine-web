import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_LLM_MODEL,
  LLM_MODELS,
  LlmModel,
  LlmSelection,
  toLlmSelection,
} from '../../constants/llm-models.constants';

const STORAGE_KEY = 'cbrain.llm.modelKey';


@Injectable({ providedIn: 'root' })
export class LlmSelectionService {
  readonly models = LLM_MODELS;

  private readonly _selected = signal<LlmModel>(this.restore());
  readonly selected = this._selected.asReadonly();

  select(model: LlmModel): void {
    this._selected.set(model);
    this.persist(model);
  }

  selectionPayload(): LlmSelection {
    return toLlmSelection(this._selected());
  }

  private restore(): LlmModel {
    const stored = this.read(STORAGE_KEY);
    return LLM_MODELS.find((m) => m.modelKey === stored) ?? DEFAULT_LLM_MODEL;
  }

  private persist(model: LlmModel): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, model.modelKey);
    } catch {

    }
  }

  private read(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
}
