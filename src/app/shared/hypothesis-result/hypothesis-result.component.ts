import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  input,
  computed,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AgentStep, HypothesisPlan, HypothesisAnalysisStep, ParsedTable, StepImage } from '../../models/conversation.models';
import { environment } from '../../../environments/environment';
import { HideIfTransparentDirective } from '../directives/hide-if-transparent.directive';
import { SignedSrcDirective } from '../directives/signed-src.directive';
import {
  parseStructuredResults,
  deepParseJsonStrings,
  objectToTables,
  arrayToTables,
  formatTableTitle as utilFormatTableTitle,
  formatCellValue as utilFormatCellValue,
  flattenObjectToString as utilFlattenObjectToString,
  isPlotData as utilIsPlotData,
} from './structured-results-parser';

@Component({
  selector: 'app-hypothesis-result',
  standalone: true,
  imports: [NgClass, HideIfTransparentDirective, SignedSrcDirective],
  templateUrl: './hypothesis-result.component.html',
  styleUrls: ['./hypothesis-result.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HypothesisResultComponent {
  constructor(private sanitizer: DomSanitizer) {}

  readonly agentSteps = input<AgentStep[]>([]);

  readonly isStreaming = input(false);

  readonly plan = computed<HypothesisPlan | null>(() => {
    const steps = this.agentSteps();
    const streaming = this.isStreaming();
    return this.buildPlan(steps, streaming);
  });

  readonly completedCount = computed(() => {
    const p = this.plan();
    return p ? p.analysisSteps.filter(s => s.status === 'completed').length : 0;
  });

  readonly totalCount = computed(() => this.plan()?.analysisSteps.length ?? 0);

  readonly stepsWithImages = computed(() => {
    const p = this.plan();
    if (!p) return [];
    return p.analysisSteps.filter(s => s.imageUrls && s.imageUrls.length > 0);
  });

  planCollapsed = false;

  togglePlan(): void {
    this.planCollapsed = !this.planCollapsed;
  }

  formatMarkdown(text: string): SafeHtml {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/\*{3}(.+?)\*{3}/g, '<strong><em>$1</em></strong>');
    html = html.replace(/_{3}(.+?)_{3}/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*{2}(.+?)\*{2}/g, '<strong>$1</strong>');
    html = html.replace(/_{2}(.+?)_{2}/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<em>$1</em>');
    html = html.replace(/\[([\d]+(?:\s*,\s*\d+)*)\]/g, (_match, inner) => {
      const nums = inner.split(',').map((s: string) => s.trim()).filter((s: string) => s);
      return nums.map((num: string) =>
        `<a class="citation-link" href="#" data-citation="${num}" title="View source ${num}" role="button"><span class="citation-link__number">${num}</span></a>`
      ).join('');
    });
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  @HostListener('click', ['$event'])
  onCitationClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const link = target.closest('.citation-link') as HTMLElement | null;
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    const citationNum = link.getAttribute('data-citation');
    if (citationNum) {
      const num = Number(citationNum);
      const rect = link.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent('citationClick', {
        detail: {
          index: num,
          rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        }
      }));
    }
  }

  formatAgentLabel(agent: string): string {
    const labels: Record<string, string> = {
      knowledge_retriever: 'Retriever',
      statistical_executor: 'Statistics',
      synthesizer: 'Synthesizer',
      critique_agent: 'Critic',
      critical: 'Critic',
    };
    return labels[agent] ?? agent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private buildPlan(steps: AgentStep[], streaming: boolean): HypothesisPlan | null {
    const plannerStep = steps.find(s => s.agent === 'hypothesis_planner');
    if (!plannerStep?.data?.analysis_steps) return null;

    const data = plannerStep.data;

    const stepResults: Record<string, any> = {};
    for (const step of steps) {
      if (step.agent === 'knowledge_retriever' && step.stepId && step.data?.retrieved_knowledge) {
        stepResults[step.stepId] = {
          retrieved_knowledge: step.data.retrieved_knowledge,
          status: step.status ?? 'completed',
        };
      }

      if (step.agent === 'knowledge_retriever' && step.data?.step_results) {
        Object.assign(stepResults, step.data.step_results);
      }

      if (step.agent === 'statistical_executor' && step.stepId && step.data) {
        stepResults[step.stepId] = {
          ...step.data,
          status: step.status ?? 'completed',
        };
      }

      if (step.agent === 'synthesizer' && step.stepId && step.data) {
        stepResults[step.stepId] = {
          ...step.data,
          status: step.status ?? 'completed',
        };
      }

      if ((step.agent === 'critique_agent' || step.agent === 'critical') && step.stepId && step.data) {
        stepResults[step.stepId] = {
          ...step.data,
          status: step.status ?? 'completed',
        };
      }
    }

    const analysisSteps: HypothesisAnalysisStep[] = (data.analysis_steps as any[]).map((s: any) => {
      const result = stepResults[s.step_id];

      const agentNameMap: Record<string, string> = {
        statistics: 'statistical_executor',
        retrieval: 'knowledge_retriever',
        critique: 'critique_agent',
        critical: 'critique_agent',
      };
      const agent: string = agentNameMap[s.agent] ?? s.agent;

      const stepStatus: 'completed' | 'running' | 'pending' = result
        ? (result.status === 'completed' ? 'completed' : 'running')
        : (streaming ? 'pending' : 'completed');

      if (stepStatus === 'running') {
        return {
          stepId: s.step_id,
          agent,
          task: s.task,
          description: s.description,
          rationale: s.rationale,
          expectedOutput: s.expected_output,
          status: 'running' as const,
          result: undefined,
          imageUrl: undefined,
          imageUrls: undefined,
          structuredResults: undefined,
          rawKeyValues: undefined,
        };
      }

      let resultText: string[] | undefined = undefined;
      if (result?.output) {

        const outputVal = result.output;
        if (typeof outputVal === 'string' && outputVal.trimStart().startsWith('{')) {
          try {
            const parsed = JSON.parse(outputVal);

            if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
              if (!result.structured_results) {
                result.structured_results = parsed;
              }
            }
          } catch {
            resultText = [outputVal];
          }
        } else if (typeof outputVal === 'object' && !Array.isArray(outputVal)) {

          if (outputVal && Object.keys(outputVal).length > 0 && !result.structured_results) {
            result.structured_results = outputVal;
          }
        } else {
          resultText = Array.isArray(outputVal) ? outputVal : [String(outputVal)];
        }
      } else if (result && agent === 'knowledge_retriever' && result.retrieved_knowledge) {
        const text = String(result.retrieved_knowledge).replace(/^\[S\d+\]\s*/, '');
        resultText = text ? [text] : undefined;
      } else if (result && agent === 'synthesizer') {
        if (Array.isArray(result.findings) && result.findings.length > 0) {
          resultText = result.findings.map((f: any) => {
            if (typeof f === 'string') return f;
            const detail = f.detail ?? f.text ?? f.finding ?? '';
            if (!detail) return '';
            const cit = f.citation;
            if (cit && typeof cit === 'object') {
              const citNum = cit.citation_number ?? cit.citationNumber;
              if (citNum != null) return `${detail} [${citNum}]`;
            }
            return detail;
          }).filter((t: string) => !!t);
          if (resultText!.length === 0) resultText = undefined;
        } else if (result.summary) {
          resultText = [String(result.summary)];
        }
      } else if (result && (agent === 'critique_agent' || agent === 'critical')) {
        const feedback = result.feedback ?? result.message ?? '';
        if (feedback) {
          const lines: string[] = [`Needs revision: ${result.needs_revision ? 'Yes' : 'No'}`];
          lines.push(feedback);
          resultText = lines;
        }
      }

      if (resultText) {
        resultText = resultText.filter(t => {
          if (!t || typeof t !== 'string') return false;
          const trimmed = t.trim();
          return trimmed.length > 0 && trimmed !== '{}' && trimmed !== '[]' && trimmed !== '0' && trimmed !== 'null';
        });
        if (resultText.length === 0) resultText = undefined;
      }

      const images = result ? this.extractStepImages(result) : [];
      if (!resultText && agent === 'statistical_executor' && images.length > 0) {
        resultText = [`${images.length} chart${images.length > 1 ? 's' : ''} generated`];
      }

      if (!resultText && agent === 'statistical_executor' && result?.summary) {
        resultText = [String(result.summary)];
      }

      let structuredResults = this.parseStructuredResults(result?.structured_results);

      if (structuredResults) {
        structuredResults = structuredResults.filter(tbl =>
          tbl.rows.length > 0 && tbl.rows.some(row => row.some(cell => cell !== '-' && cell.trim() !== ''))
        );
        if (structuredResults.length === 0) structuredResults = undefined;
      }

      let rawKeyValues: { key: string; value: string }[] | undefined;
      if (result && !resultText && !structuredResults?.length) {
        const fallbackTables = this.extractFallbackTables(result);
        if (fallbackTables?.length) {
          structuredResults = fallbackTables;
        } else {
          rawKeyValues = this.extractRawKeyValues(result);
          if (rawKeyValues.length === 0) rawKeyValues = undefined;
        }

        if (structuredResults) {
          structuredResults = structuredResults.filter(tbl =>
            tbl.rows.length > 0 && tbl.rows.some(row => row.some(cell => cell !== '-' && cell.trim() !== ''))
          );
          if (structuredResults.length === 0) structuredResults = undefined;
        }

        if (!structuredResults && !rawKeyValues && result.structured_results) {
          const sr = result.structured_results;
          if (typeof sr === 'object' && sr !== null) {
            rawKeyValues = this.extractRawKeyValues(sr);
            if (rawKeyValues!.length === 0) rawKeyValues = undefined;
          }
        }
      }

      let strengths: string[] | undefined;
      let validationSummary: string | undefined;
      if (result && (agent === 'critique_agent' || agent === 'critical')) {
        if (Array.isArray(result.strengths) && result.strengths.length > 0) {
          strengths = result.strengths
            .map((s: any) => typeof s === 'string' ? s.trim() : String(s))
            .filter((s: string) => !!s);
          if (strengths!.length === 0) strengths = undefined;
        }
        if (result.validation_summary) {
          validationSummary = String(result.validation_summary);
        }
      }

      return {
        stepId: s.step_id,
        agent,
        task: s.task,
        description: s.description,
        rationale: s.rationale,
        expectedOutput: s.expected_output,
        status: stepStatus,
        result: resultText,
        imageUrl: result?.image_url ?? undefined,
        imageUrls: images.length > 0 ? images : undefined,
        structuredResults,
        rawKeyValues,
        strengths,
        validationSummary,
      };
    });

    return {
      hypothesis: data.hypothesis ?? '',
      objective: data.objective ?? '',
      executionLogs: data.execution_logs ?? [],
      methodologyChecks: data.methodology_checks ?? [],
      analysisSteps,
      validationCriteria: data.validation_criteria ?? [],
    };
  }

  private parseStructuredResults(data: any): ParsedTable[] | undefined {
    return parseStructuredResults(data);
  }

  private objectToTables(data: any, title?: string): ParsedTable[] {
    return objectToTables(data, title);
  }

  private arrayToTables(arr: any[], title?: string): ParsedTable[] {
    return arrayToTables(arr, title);
  }

  private formatCellValue(val: any): string {
    return utilFormatCellValue(val);
  }

  private flattenObjectToString(obj: any, maxDepth = 2): string {
    return utilFlattenObjectToString(obj, maxDepth);
  }

  private isPlotData(obj: any): boolean {
    return utilIsPlotData(obj);
  }

  private formatTableTitle(key: string): string {
    return utilFormatTableTitle(key);
  }

  private deepParseJsonStrings(data: any): any {
    return deepParseJsonStrings(data);
  }

  private extractFallbackTables(data: any): ParsedTable[] | undefined {
    if (!data || typeof data !== 'object') return undefined;
    data = this.deepParseJsonStrings(data);
    const skip = new Set(['status', 'step_results', 'generated_artifacts', 'artifacts', 'images', 'image_urls', 'image_url', 'output', 'summary', 'strengths', 'validation_summary', 'needs_revision', 'feedback', 'message']);
    const tables: ParsedTable[] = [];

    for (const [key, val] of Object.entries(data)) {
      if (skip.has(key) || val == null) continue;

      if (typeof val === 'object' && !Array.isArray(val)) {
        const nested = this.objectToTables(val as any, this.formatTableTitle(key));
        if (nested.length) tables.push(...nested);
      } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        const nested = this.arrayToTables(val, this.formatTableTitle(key));
        if (nested.length) tables.push(...nested);
      }
    }

    return tables.length ? tables : undefined;
  }

  private extractRawKeyValues(data: any): { key: string; value: string }[] {
    if (!data || typeof data !== 'object') return [];
    const skip = new Set(['status', 'step_results', 'generated_artifacts', 'artifacts', 'images', 'image_urls', 'image_url', 'strengths', 'validation_summary', 'needs_revision', 'feedback', 'message']);
    const pairs: { key: string; value: string }[] = [];

    for (const [key, val] of Object.entries(data)) {
      if (skip.has(key) || val == null) continue;
      if (typeof val === 'string' && val.trim()) {
        pairs.push({ key: this.formatTableTitle(key), value: val.trim() });
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        pairs.push({ key: this.formatTableTitle(key), value: String(val) });
      } else if (Array.isArray(val) && val.length > 0) {
        if (typeof val[0] !== 'object') {
          pairs.push({ key: this.formatTableTitle(key), value: val.join(', ') });
        } else {
          const lines = val.map((item: any) => {
            if (typeof item === 'string') return item;
            const parts = Object.entries(item)
              .filter(([, v]) => v != null && typeof v !== 'object')
              .map(([k, v]) => `${this.formatTableTitle(k)}: ${v}`);
            return parts.join(' | ');
          }).filter((l: string) => !!l);
          if (lines.length) {
            pairs.push({ key: this.formatTableTitle(key), value: lines.join('\n') });
          }
        }
      } else if (typeof val === 'object' && !Array.isArray(val)) {
        const nested = Object.entries(val)
          .filter(([, v]) => v != null && typeof v !== 'object')
          .map(([k, v]) => `${this.formatTableTitle(k)}: ${v}`)
          .join(', ');
        if (nested) {
          pairs.push({ key: this.formatTableTitle(key), value: nested });
        }
      }
    }
    return pairs;
  }

  private extractStepImages(data: any): StepImage[] {
    const raw: any[] = data.generated_artifacts ?? data.artifacts ?? data.images ?? data.image_urls ?? [];
    if (!Array.isArray(raw)) return [];

    return raw.map((item: any, i: number) => {
      const rawUrl = typeof item === 'string' ? item : (item.url ?? item.path ?? '');
      const label = typeof item === 'string'
        ? `Chart ${i + 1}`
        : (item.label ?? item.title ?? `Chart ${i + 1}`);
      return { url: this.resolveImageUrl(rawUrl), label };
    }).filter(img => !!img.url);
  }

  private resolveImageUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return rawUrl;
    const base = environment.artifactStorageBaseUrl ?? '';
    if (!base) return rawUrl;
    const separator = base.endsWith('/') || rawUrl.startsWith('/') ? '' : '/';
    return `${base}${separator}${rawUrl}`;
  }
}
