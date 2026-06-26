import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import {
  DEFAULT_REVIEWER_PARAMETERS,
  ReviewerParamKey,
  ReviewerParamOption,
  ReviewerParameterOptions,
  ReviewerParameters,
} from '../../constants/reviewer-params.constants';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const STORAGE_KEY = 'cbrain.reviewer.params';


@Injectable({ providedIn: 'root' })
export class ReviewerParamsService {
  private readonly http = inject(HttpClient);

  private readonly _status = signal<LoadStatus>('idle');
  private readonly _options = signal<ReviewerParameterOptions | null>(null);

  private readonly _selection = signal<ReviewerParameters>(this.seedSelection());

  readonly status = this._status.asReadonly();

  optionsFor(key: ReviewerParamKey): readonly ReviewerParamOption[] {
    const opts = this._options();
    if (!opts) return [];
    return key === 'tone'
      ? opts.toneOptions
      : key === 'depth'
        ? opts.depthOptions
        : opts.personaOptions;
  }

  selectedValue(key: ReviewerParamKey): string {
    return this._selection()[key];
  }

  ensureLoaded(): void {
    const status = this._status();
    if (status === 'loading' || status === 'ready') return;
    this.load();
  }

  retry(): void {
    if (this._status() === 'loading') return;
    this.load();
  }

  select(key: ReviewerParamKey, value: string): void {
    const current = this._selection();
    if (current[key] === value) return;
    const next: ReviewerParameters = { ...current, [key]: value };
    this._selection.set(next);
    this.persist(next);
  }


  payload(): ReviewerParameters {
    return this._selection();
  }

  private load(): void {
    this._status.set('loading');
    this.http
      .get<ApiResponse<ReviewerParameterOptions>>(
        `${environment.apiBaseUrl}/Chat/reviewer-parameter-options`,
      )
      .subscribe({
        next: (res) => {
          const data = this.unwrap(res);
          if (!data?.defaults) {
            this._status.set('error');
            return;
          }
          this._options.set(data);
          this._selection.set(this.resolveSelection(data));
          this._status.set('ready');
        },
        error: () => this._status.set('error'),
      });
  }

  private unwrap(
    res: ApiResponse<ReviewerParameterOptions> | ReviewerParameterOptions | null,
  ): ReviewerParameterOptions | null {
    if (!res) return null;
    const wrapped = res as ApiResponse<ReviewerParameterOptions>;
    return wrapped.data ?? (res as ReviewerParameterOptions) ?? null;
  }

  private seedSelection(): ReviewerParameters {
    const stored = this.readStored();
    return {
      tone: stored?.tone ?? DEFAULT_REVIEWER_PARAMETERS.tone,
      depth: stored?.depth ?? DEFAULT_REVIEWER_PARAMETERS.depth,
      persona: stored?.persona ?? DEFAULT_REVIEWER_PARAMETERS.persona,
    };
  }

  private resolveSelection(data: ReviewerParameterOptions): ReviewerParameters {
    const stored = this.readStored();
    const pick = (
      key: ReviewerParamKey,
      options: readonly ReviewerParamOption[],
    ): string => {
      const saved = stored?.[key];
      return saved && options.some((o) => o.value === saved)
        ? saved
        : data.defaults[key];
    };
    return {
      tone: pick('tone', data.toneOptions),
      depth: pick('depth', data.depthOptions),
      persona: pick('persona', data.personaOptions),
    };
  }

  private readStored(): Partial<ReviewerParameters> | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<ReviewerParameters>) : null;
    } catch {
      return null;
    }
  }

  private persist(selection: ReviewerParameters): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {

    }
  }
}
