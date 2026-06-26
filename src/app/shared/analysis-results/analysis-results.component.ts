import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  input,
  computed,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AgentStep } from '../../models/conversation.models';
import {
  AnalysisViewModel,
  StatisticalResult,
  SynthesizerFinding,
  FindingCitation,
  CriticalResult,
  RevisionStatus,
  AgentStatusInfo,
  ArtifactImage,
  StructuredTableRow,
  DynamicTable,
} from '../../models/analysis-results.models';
import { environment } from '../../../environments/environment';
import { HideIfTransparentDirective } from '../directives/hide-if-transparent.directive';
import { SignedSrcDirective } from '../directives/signed-src.directive';

const ANALYSIS_AGENTS = ['statistical_executor', 'synthesizer', 'critical', 'critique_agent'] as const;

const FINDING_LABELS: readonly string[] = [
  'Background Context',
  'Conceptual Framework',
  'Methodology Evaluation',
  'Literature Synthesis',
  'Statistical Interpretation',
  'Mechanistic Explanation',
  'Evidence Integration',
  'Contradictions',
  'Limitations',
  'Hypothesis Implications',
  'Broader Implications',
  'Conclusion',
] as const;

@Component({
  selector: 'app-analysis-results',
  standalone: true,
  imports: [NgClass, HideIfTransparentDirective, SignedSrcDirective],
  templateUrl: './analysis-results.component.html',
  styleUrls: ['./analysis-results.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisResultsComponent {
  constructor(private sanitizer: DomSanitizer) {}

  readonly agentSteps = input<AgentStep[]>([]);

  readonly isStreaming = input(false);

  readonly vm = computed<AnalysisViewModel>(() => {
    const steps = this.agentSteps();
    const streaming = this.isStreaming();
    return this.buildViewModel(steps, streaming);
  });

  readonly lightboxImage = signal<ArtifactImage | null>(null);

  readonly modalTable = signal<DynamicTable | null>(null);

  statisticalCollapsed = false;
  findingsCollapsed = false;

  toggleStatistical(): void {
    this.statisticalCollapsed = !this.statisticalCollapsed;
  }

  toggleFindings(): void {
    this.findingsCollapsed = !this.findingsCollapsed;
  }

  openLightbox(image: ArtifactImage): void {
    this.lightboxImage.set(image);
  }

  closeLightbox(): void {
    this.lightboxImage.set(null);
  }

  openTableModal(table: DynamicTable): void {
    this.modalTable.set(table);
  }

  closeTableModal(): void {
    this.modalTable.set(null);
  }

  getPreviewRows(table: DynamicTable): string[][] {
    return table.rows.slice(0, 3);
  }

  formatCellWithCitations(text: string): SafeHtml {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = html.replace(/\*{2}(.+?)\*{2}/g, '<strong>$1</strong>');
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

  getFindingLabel(index: number): string {
    return FINDING_LABELS[index] ?? `Finding ${index + 1}`;
  }

  formatAgentName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }


  private buildViewModel(steps: AgentStep[], streaming: boolean): AnalysisViewModel {
    const statistical = this.extractStatistical(steps);
    const findings = this.extractFindings(steps);
    const critical = this.extractCritical(steps);
    const revision = this.buildRevisionStatus(critical, streaming);
    const agents = this.buildAgentStatuses(steps, streaming);

    const hasAnyData = statistical !== null || findings.length > 0 || critical !== null;

    return { statistical, findings, critical, revision, agents, hasAnyData };
  }

  private extractStatistical(steps: AgentStep[]): StatisticalResult | null {
    const statSteps = steps.filter(s => s.agent === 'statistical_executor' && s.data);
    if (statSteps.length === 0) return null;

    const dedupedSteps = this.deduplicateByStepId(statSteps);

    const allImages: ArtifactImage[] = [];
    const allTableRows: StructuredTableRow[] = [];
    const allDynamicTables: DynamicTable[] = [];
    let summary: string | null = null;

    for (const step of dedupedSteps) {
      const data = step.data;
      allImages.push(...this.extractImages(data));
      allTableRows.push(...this.extractTableRows(data));
      allDynamicTables.push(...this.extractDynamicTables(data));
      const stepSummary = data.summary ?? data.description ?? null;
      if (stepSummary) summary = stepSummary;
    }
    const seenUrls = new Set<string>();
    const uniqueImages = allImages.filter(img => {
      if (seenUrls.has(img.url)) return false;
      seenUrls.add(img.url);
      return true;
    });

    if (uniqueImages.length === 0 && allTableRows.length === 0 && allDynamicTables.length === 0 && !summary) return null;
    return { images: uniqueImages, tableRows: allTableRows, dynamicTables: allDynamicTables, summary: summary ?? undefined };
  }

  private deduplicateByStepId(steps: AgentStep[]): AgentStep[] {
    const byStepId = new Map<string, AgentStep>();
    const noStepId: AgentStep[] = [];

    for (const step of steps) {
      if (step.stepId) {
        byStepId.set(step.stepId, step);
      } else {
        noStepId.push(step);
      }
    }

    return [...byStepId.values(), ...noStepId];
  }

  private extractImages(data: any): ArtifactImage[] {
    const raw: any[] = data.generated_artifacts ?? data.artifacts ?? data.images ?? data.image_urls ?? [];
    if (!Array.isArray(raw)) return [];

    return raw.map((item: any, i: number) => {
      const rawUrl = typeof item === 'string' ? item : (item.url ?? item.path ?? '');
      const label = typeof item === 'string'
        ? `Chart ${i + 1}`
        : (item.label ?? item.title ?? `Chart ${i + 1}`);
      const stepId = typeof item === 'object' ? item.step_id : undefined;

      return { url: this.resolveImageUrl(rawUrl), label, stepId };
    }).filter(img => !!img.url);
  }

  private extractTableRows(data: any): StructuredTableRow[] {

    const raw = data.structured_results ?? data.table ?? data.results ?? [];

    if (Array.isArray(raw)) {
      return raw.map((row: any) => {
        const pRaw = row.p_value ?? row.pValue ?? row.pvalue ?? row.p_val ?? row.p;
        return {
          metric: row.metric ?? row.name ?? row.test ?? '',
          value: String(row.value ?? row.statistic ?? row.result ?? ''),
          pValue: pRaw != null ? String(pRaw) : undefined,
          significant: row.significant ?? (pRaw != null ? Number(pRaw) < 0.05 : undefined),
        };
      }).filter(r => !!r.metric);
    }

    if (raw && typeof raw === 'object') {
      const biomarkers = raw.biomarkers ?? raw.biomarker_results ?? raw.results;
      if (biomarkers && typeof biomarkers === 'object' && !Array.isArray(biomarkers)) {
        return this.extractBiomarkerRows(biomarkers);
      }

      const featureStats = raw.feature_stats;
      if (featureStats && typeof featureStats === 'object' && !Array.isArray(featureStats)) {
        return this.extractBiomarkerRows(featureStats);
      }

      const topKeys = Object.keys(raw);
      const looksLikeBiomarkerMap = topKeys.length > 0 && topKeys.every(k => {
        const v = raw[k];
        return v && typeof v === 'object' && !Array.isArray(v) && ('auc' in v || 'AUC' in v || 'p_value' in v || 'odds_ratio' in v);
      });
      if (looksLikeBiomarkerMap) {
        return this.extractBiomarkerRows(raw);
      }
    }

    return [];
  }

  private extractBiomarkerRows(biomarkers: Record<string, any>): StructuredTableRow[] {
    const rows: StructuredTableRow[] = [];
    for (const [name, stats] of Object.entries(biomarkers)) {
      if (!stats || typeof stats !== 'object') continue;

      const lr = stats.logistic_regression ?? {};
      const or = stats.odds_ratio ?? stats.odds_ratio_per_SD ?? stats.odds_ratio_per_1SD ?? lr.odds_ratio_per_1SD ?? lr.odds_ratio;
      const auc = stats.auc ?? stats.AUC ?? lr.AUC ?? lr.auc;
      const pVal = stats.odds_ratio_p_value ?? stats.p_value ?? stats.pvalue ?? stats.p_val
        ?? lr.odds_ratio_p_value ?? lr.p_value ?? lr.pvalue ?? lr.p_val
        ?? this.findPValue(stats) ?? this.findPValue(lr);

      let ci: [number, number] | undefined;
      if (Array.isArray(stats.auc_ci_95) && stats.auc_ci_95.length === 2) {
        ci = stats.auc_ci_95;
      } else if (Array.isArray(stats.auc_CI_95) && stats.auc_CI_95.length === 2) {
        ci = stats.auc_CI_95;
      } else if (Array.isArray(stats.odds_ratio_ci) && stats.odds_ratio_ci.length === 2) {
        ci = stats.odds_ratio_ci;
      } else if (Array.isArray(stats.odds_ratio_CI_95) && stats.odds_ratio_CI_95.length === 2) {
        ci = stats.odds_ratio_CI_95;
      } else if (stats.auc_ci_lower != null && stats.auc_ci_upper != null) {
        ci = [stats.auc_ci_lower, stats.auc_ci_upper];
      } else if (stats.auc_95ci_lower != null && stats.auc_95ci_upper != null) {
        ci = [stats.auc_95ci_lower, stats.auc_95ci_upper];
      } else if (stats.AUC_CI_95 != null && Array.isArray(stats.AUC_CI_95)) {
        ci = stats.AUC_CI_95;
      } else if (lr['95CI_lower'] != null && lr['95CI_upper'] != null) {
        ci = [lr['95CI_lower'], lr['95CI_upper']];
      } else if (Array.isArray(stats.auc_ci) && stats.auc_ci.length === 2) {
        ci = stats.auc_ci;
      }

      const parts: string[] = [];
      if (or != null && isFinite(or)) parts.push(`OR: ${Number(or).toFixed(3)}`);
      if (auc != null && isFinite(auc)) parts.push(`AUC: ${Number(auc).toFixed(3)}`);
      if (ci && ci.every((v: any) => v != null && isFinite(v))) {
        parts.push(`95% CI: [${Number(ci[0]).toFixed(3)}, ${Number(ci[1]).toFixed(3)}]`);
      }
      const nSamples = stats.n_samples ?? stats.n;
      if (nSamples != null) parts.push(`N: ${nSamples}`);

      if (parts.length === 0) {
        const test = stats.test;
        if (test && typeof test === 'object') {
          if (test.statistic != null) parts.push(`Stat: ${Number(test.statistic).toFixed(3)}`);
          if (test.effect_size != null) parts.push(`Effect: ${Number(test.effect_size).toFixed(3)}`);
          if (test.name) parts.push(`Test: ${test.name}`);
        }

        for (const groupKey of ['PET_positive', 'PET_negative', 'positive', 'negative']) {
          const group = stats[groupKey];
          if (group && typeof group === 'object') {
            const mean = group.mean != null ? Number(group.mean).toFixed(3) : null;
            const n = group.n ?? group.count;
            if (mean != null) parts.push(`${groupKey} mean: ${mean}${n != null ? ` (n=${n})` : ''}`);
          }
        }
      }

      rows.push({
        metric: name,
        value: parts.join(' | ') || '-',
        pValue: pVal != null && isFinite(pVal) ? Number(pVal).toExponential(2) : undefined,
        significant: pVal != null && isFinite(pVal) ? Number(pVal) < 0.05 : undefined,
      });
    }
    return rows;
  }

  private findPValue(obj: Record<string, any>): number | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const key of Object.keys(obj)) {
      const k = key.toLowerCase();
      if ((k.includes('p_value') || k.includes('pvalue') || k === 'p_val' || k === 'p')
          && obj[key] != null && isFinite(Number(obj[key]))) {
        return Number(obj[key]);
      }
    }
    return undefined;
  }

  private extractFindings(steps: AgentStep[]): SynthesizerFinding[] {
    const step = [...steps].reverse().find(s => s.agent === 'synthesizer');
    if (!step?.data) return [];

    const raw: any[] = step.data.findings ?? [];
    if (!Array.isArray(raw)) return [];

    const findings: SynthesizerFinding[] = [];

    for (const item of raw) {
      if (Array.isArray(item)) {
        const details: string[] = [];
        const citations: FindingCitation[] = [];
        for (const entry of item) {
          const d = typeof entry === 'string' ? entry : (entry.detail ?? entry.text ?? entry.finding ?? '');
          if (d.trim()) details.push(d.trim());
          const cit = this.parseFindingCitation(entry?.citation);
          if (cit) citations.push(cit);
        }
        if (details.length) {
          findings.push({ detail: details.join('\n\n'), citations });
        }
      } else {
        const detail = typeof item === 'string' ? item : (item.detail ?? item.text ?? item.finding ?? '');
        if (!detail.trim()) continue;
        const cit = this.parseFindingCitation(item?.citation);
        findings.push({ detail: detail.trim(), citations: cit ? [cit] : [] });
      }
    }

    return findings;
  }

  private parseFindingCitation(raw: any): FindingCitation | null {
    if (!raw || typeof raw !== 'object') return null;
    const num = raw.citation_number ?? raw.citationNumber;
    if (num == null) return null;
    return {
      citationNumber: Number(num),
      paperId: raw.paper_id ?? raw.paperId ?? undefined,
      doi: raw.doi ?? undefined,
      doiUrl: raw.doi_url ?? raw.doiUrl ?? undefined,
      title: raw.title ?? undefined,
      authors: raw.authors ?? undefined,
      abstract: raw.abstract ?? undefined,
      paperUrl: raw.paper_url ?? raw.paperUrl ?? undefined,
    };
  }

  private extractCritical(steps: AgentStep[]): CriticalResult | null {
    const step = [...steps].reverse().find(s => s.agent === 'critique_agent' || s.agent === 'critical');
    if (!step?.data) return null;

    const data = step.data;

    const flags = data.revise_flags ?? {};
    let revisionAgents: string[] = [];
    if (Array.isArray(data.revision_agents)) {
      revisionAgents = data.revision_agents;
    } else {
      if (data.revise_planner || flags.planner) revisionAgents.push('hypothesis_planner');
      if (data.revise_retrieval || flags.retrieval) revisionAgents.push('knowledge_retriever');
      if (data.revise_statistics || flags.statistics) revisionAgents.push('statistical_executor');
      if (data.revise_synthesis || flags.synthesis) revisionAgents.push('synthesizer');
    }


    const critiqueCount = steps.filter(s => s.agent === 'critique_agent' || s.agent === 'critical').length;

    const rawStrengths = data.strengths ?? [];
    const strengths: string[] = Array.isArray(rawStrengths)
      ? rawStrengths.map((s: any) => typeof s === 'string' ? s : String(s)).filter((s: string) => !!s.trim())
      : [];

    const rawIssues = data.issues ?? [];
    const issues: string[] = Array.isArray(rawIssues)
      ? rawIssues.map((i: any) => typeof i === 'string' ? i : (i?.description ?? i?.text ?? i?.message ?? JSON.stringify(i))).filter((s: string) => !!s)
      : [];

    return {
      needsRevision: !!data.needs_revision,
      revisionAgents,
      feedback: data.feedback ?? data.message ?? '',
      revisionCycle: critiqueCount || 1,
      issues,
      strengths,
      validationSummary: data.validation_summary ?? '',
    };
  }

  private buildRevisionStatus(critical: CriticalResult | null, streaming: boolean): RevisionStatus {
    if (!critical?.needsRevision) {
      return { active: false, cycle: 0, agents: [] };
    }
    return {
      active: streaming,
      cycle: critical.revisionCycle,
      agents: critical.revisionAgents,
    };
  }

  private buildAgentStatuses(steps: AgentStep[], streaming: boolean): AgentStatusInfo[] {

    const displayAgents: Array<{ name: string; match: string[] }> = [
      { name: 'statistical_executor', match: ['statistical_executor'] },
      { name: 'synthesizer', match: ['synthesizer'] },
      { name: 'critical', match: ['critical', 'critique_agent'] },
    ];

    return displayAgents.map(({ name, match }) => {
      const step = [...steps].reverse().find(s => match.includes(s.agent));
      const status = step
        ? (step.status as AgentStatusInfo['status'])
        : (streaming ? 'pending' : 'pending');

      return {
        name,
        displayName: this.formatAgentName(name),
        status,
        message: step?.message ?? '',
      };
    });
  }

  isUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  linkify(text: string): SafeHtml {
    if (!text) return '';

    const mdLinks: { placeholder: string; html: string }[] = [];
    let processed = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_match, label, url) => {
      if (/^https?:\/\/doi\.org\/S\d+$/i.test(url)) {
        return label;
      }
      const placeholder = `__MDLINK_${mdLinks.length}__`;
      const escapedLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const escapedUrl = url.replace(/&/g, '&amp;');
      mdLinks.push({
        placeholder,
        html: `<a class="anr__link" href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${escapedLabel}</a>`,
      });
      return placeholder;
    });

    processed = processed.replace(/https?:\/\/doi\.org\/S\d+/gi, '');

    const mdTables: { placeholder: string; html: string }[] = [];
    processed = this.extractMarkdownTables(processed, mdTables);

    processed = processed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    processed = processed.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');

    processed = processed.replace(
      /\b(https?:\/\/[^\s<)}\]]+)/g,
      '<a class="anr__link" href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    for (const { placeholder, html } of mdLinks) {
      processed = processed.replace(placeholder, html);
    }
    for (const { placeholder, html } of mdTables) {
      processed = processed.replace(placeholder, html);
    }

    
    processed = processed.replace(/\n{2,}/g, '</p><p>');
    processed = processed.replace(/\n/g, '<br>');
    processed = '<p>' + processed + '</p>';
    processed = processed.replace(/<p>\s*<\/p>/g, '');

    return this.sanitizer.bypassSecurityTrustHtml(processed);
  }

  private extractMarkdownTables(text: string, tables: { placeholder: string; html: string }[]): string {

    text = text.replace(
      /\|(.+)\|\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/g,
      (match, headerRow, separatorRow, bodyRows) => {
        const colCount = (separatorRow.match(/-{3,}/g) || []).length;
        if (colCount < 2) return match;

        let headers = this.linkifySplitCells(headerRow);
        if (headers.length > colCount) headers = headers.slice(headers.length - colCount);
        while (headers.length < colCount) headers.push('');

        const rows = this.linkifyParseBody(bodyRows.trim(), colCount);
        if (rows.length === 0) return match;

        return this.storeLinkifyTable(headers, rows, tables);
      }
    );

    const sepRegex = /\|(?:\s*[-:]{3,}\s*\|){2,}/;
    let iterations = 0;
    while (sepRegex.test(text) && iterations < 5) {
      iterations++;
      const result = this.extractFlatLinkifyTable(text, tables);
      if (!result) break;
      text = result;
    }

    text = this.extractPipeTables(text, tables);

    return text;
  }

  private extractPipeTables(text: string, tables: { placeholder: string; html: string }[]): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let buffer: string[] = [];

    const hasPipes = (line: string): boolean => {
      const t = line.trim();
      if (t.startsWith('__MDTABLE_') || t.startsWith('<')) return false;
      return (t.match(/\|/g) || []).length >= 3;
    };

    const flush = () => {
      if (buffer.length >= 2) {
        result.push(this.buildPipeTableFromLinesLinkify(buffer, tables));
      } else if (buffer.length === 1) {
        result.push(this.parseSingleLinePipeTableLinkify(buffer[0], tables));
      }
      buffer = [];
    };

    for (const line of lines) {
      if (hasPipes(line)) {
        buffer.push(line);
      } else {
        flush();
        result.push(line);
      }
    }
    flush();

    return result.join('\n');
  }

  private buildPipeTableFromLinesLinkify(lines: string[], tables: { placeholder: string; html: string }[]): string {
    const dataLines = lines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()));
    if (dataLines.length < 2) return lines.join('\n');

    const rows = dataLines.map(l => this.linkifySplitCells(l));
    const colCount = Math.max(...rows.map(r => r.length));

    const padded = rows.map(r => {
      while (r.length < colCount) r.push('');
      return r.slice(0, colCount);
    });

    return this.storeLinkifyTable(padded[0], padded.slice(1), tables);
  }

  private parseSingleLinePipeTableLinkify(line: string, tables: { placeholder: string; html: string }[]): string {
    const totalPipes = (line.match(/\|/g) || []).length;
    if (totalPipes < 6) return line;

    const firstPipe = line.indexOf('|');
    const lastPipe = line.lastIndexOf('|');
    if (firstPipe === lastPipe) return line;

    const pipeRegion = line.substring(firstPipe, lastPipe + 1);

    let bestCols = -1;
    let bestScore = -1;

    for (let cols = 2; cols <= Math.min(15, totalPipes - 1); cols++) {
      const rows = this.linkifySplitByPipeCount(pipeRegion, cols + 1);
      if (rows.length < 2) continue;

      const firstRowCells = this.linkifySplitCells(rows[0]);
      const nonEmpty = firstRowCells.filter(c => c.length > 0).length;
      const headerQuality = nonEmpty / cols;
      const score = headerQuality >= 1 ? rows.length * 100 : rows.length * headerQuality;
      if (score > bestScore) {
        bestScore = score;
        bestCols = cols;
      }
    }

    if (bestCols < 2) return line;

    const rows = this.linkifySplitByPipeCount(pipeRegion, bestCols + 1);
    const allRows = rows.map(r => {
      const cells = this.linkifySplitCells(r);
      while (cells.length < bestCols) cells.push('');
      return cells.slice(0, bestCols);
    });

    const pre = line.substring(0, firstPipe).trim();
    const post = line.substring(lastPipe + 1).trim();
    const placeholder = this.storeLinkifyTable(allRows[0], allRows.slice(1), tables);

    const parts: string[] = [];
    if (pre) parts.push(pre);
    parts.push(placeholder);
    if (post) parts.push(post);
    return parts.join('\n');
  }

  private extractFlatLinkifyTable(text: string, tables: { placeholder: string; html: string }[]): string | null {
    const sepMatch = text.match(/\|(?:\s*[-:]{3,}\s*\|){2,}/);
    if (!sepMatch || sepMatch.index === undefined) return null;

    const separator = sepMatch[0];
    const colCount = (separator.match(/-{3,}/g) || []).length;
    if (colCount < 2) return null;

    const pipesPerRow = colCount + 1;
    const sepStart = sepMatch.index;
    const sepEnd = sepStart + separator.length;

    const before = text.substring(0, sepStart).replace(/\n/g, ' ');
    const after = text.substring(sepEnd).replace(/\n/g, ' ');

    const headerStr = this.linkifyExtractLastRow(before, pipesPerRow);
    if (!headerStr) return null;

    const headerStart = before.lastIndexOf(headerStr);
    const proseText = before.substring(0, headerStart).trim();

    const { rows: bodyStrs, endIndex } = this.linkifyExtractRows(after, pipesPerRow);
    if (bodyStrs.length === 0) return null;

    const remainderText = after.substring(endIndex).trim();

    let headers = this.linkifySplitCells(headerStr);
    if (headers.length > colCount) headers = headers.slice(headers.length - colCount);
    while (headers.length < colCount) headers.push('');

    const rows = bodyStrs.map(r => {
      const cells = this.linkifySplitCells(r);
      while (cells.length < colCount) cells.push('');
      return cells.slice(0, colCount);
    });

    const placeholder = this.storeLinkifyTable(headers, rows, tables);

    const parts: string[] = [];
    if (proseText) parts.push(proseText);
    parts.push(placeholder);
    if (remainderText) parts.push(remainderText);
    return parts.join('\n');
  }

  private storeLinkifyTable(headers: string[], rows: string[][], tables: { placeholder: string; html: string }[]): string {
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const thHtml = headers.map(h => `<th>${esc(h) || '&nbsp;'}</th>`).join('');
    const tbHtml = rows.map(row =>
      `<tr>${row.map(c => `<td>${esc(c) || '&nbsp;'}</td>`).join('')}</tr>`
    ).join('');

    const html = `<div class="anr__md-table-wrap"><table class="anr__md-table"><thead><tr>${thHtml}</tr></thead><tbody>${tbHtml}</tbody></table></div>`;
    const placeholder = `__MDTABLE_${tables.length}__`;
    tables.push({ placeholder, html });
    return placeholder;
  }

  private linkifyParseBody(bodyText: string, colCount: number): string[][] {
    const rows: string[][] = [];
    for (const line of bodyText.split('\n')) {
      const cells = this.linkifySplitCells(line);
      if (cells.length <= colCount) {
        while (cells.length < colCount) cells.push('');
        rows.push(cells);
      } else {
        for (const rowStr of this.linkifySplitByPipeCount(line, colCount + 1)) {
          const rowCells = this.linkifySplitCells(rowStr);
          while (rowCells.length < colCount) rowCells.push('');
          rows.push(rowCells.slice(0, colCount));
        }
      }
    }
    return rows;
  }

  private linkifyExtractLastRow(text: string, pipesPerRow: number): string | null {
    const trimmed = text.trimEnd();
    let pipeCount = 0;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      if (trimmed[i] === '|') {
        pipeCount++;
        if (pipeCount === pipesPerRow) return trimmed.substring(i);
      }
    }
    return null;
  }

  private linkifyExtractRows(text: string, pipesPerRow: number): { rows: string[]; endIndex: number } {
    const rows: string[] = [];
    let pipeCount = 0;
    let rowStart = -1;
    let lastEnd = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '|') {
        if (rowStart === -1) rowStart = i;
        pipeCount++;
        if (pipeCount === pipesPerRow) {
          rows.push(text.substring(rowStart, i + 1).trim());
          lastEnd = i + 1;
          pipeCount = 0;
          rowStart = -1;
        }
      } else if (rowStart === -1 && text[i] !== ' ' && text[i] !== '\t' && text[i] !== '\n') {
        break;
      }
    }

    return { rows, endIndex: lastEnd };
  }

  private linkifySplitByPipeCount(text: string, pipesPerRow: number): string[] {
    const rows: string[] = [];
    let pipeCount = 0;
    let rowStart = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '|') {
        pipeCount++;
        if (pipeCount === pipesPerRow) {
          rows.push(text.substring(rowStart, i + 1).trim());
          pipeCount = 0;
          rowStart = i + 1;
        }
      }
    }
    const remaining = text.substring(rowStart).trim();
    if (remaining && remaining.includes('|')) rows.push(remaining);
    return rows;
  }

  private linkifySplitCells(row: string): string[] {
    const cells = row.split('|');
    if (cells.length > 0 && cells[0].trim() === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map(c => c.trim());
  }

  private deepParseJsonStrings(data: any): any {
    if (data == null) return data;
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
        try { return this.deepParseJsonStrings(JSON.parse(trimmed)); } catch { return data; }
      }
      return data;
    }
    if (Array.isArray(data)) {
      return data.map(item => this.deepParseJsonStrings(item));
    }
    if (typeof data === 'object') {
      const result: any = {};
      for (const [key, val] of Object.entries(data)) {
        result[key] = this.deepParseJsonStrings(val);
      }
      return result;
    }
    return data;
  }

  private extractDynamicTables(data: any): DynamicTable[] {
    let raw = data.structured_results ?? data.table ?? data.results;

    if (!raw && data.output) {
      const outputVal = data.output;
      if (typeof outputVal === 'string' && outputVal.trimStart().startsWith('{')) {
        try {
          const parsed = JSON.parse(outputVal);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
            raw = parsed;
          }
        } catch {  }
      } else if (typeof outputVal === 'object' && !Array.isArray(outputVal) && outputVal && Object.keys(outputVal).length > 0) {
        raw = outputVal;
      }
    }

    if (!raw) return [];

    raw = this.deepParseJsonStrings(raw);

    if (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0) return [];

    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
      const keys = Object.keys(raw[0]);
      const knownKeys = new Set(['metric', 'name', 'test', 'value', 'statistic', 'result', 'p_value', 'pValue', 'pvalue', 'p_val', 'p', 'significant']);
      const isKnownSchema = keys.every(k => knownKeys.has(k));
      if (isKnownSchema) return [];

      const headerSet = new Set<string>();
      for (const item of raw) {
        if (item && typeof item === 'object') {
          for (const k of Object.keys(item)) headerSet.add(k);
        }
      }
      const headers = Array.from(headerSet);
      const allRows = raw.map((item: any) => headers.map(h => this.formatDynamicCellValue(item[h])));
      return [{
        headers: headers.map(h => this.formatTableTitle(h)),
        rows: allRows,
        totalRows: allRows.length,
      }];
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const keys = Object.keys(raw);

      const bioKey = keys.find(k => k === 'biomarkers' || k === 'biomarker_results' || k === 'results');
      if (bioKey && typeof raw[bioKey] === 'object' && !Array.isArray(raw[bioKey])) return [];

      return this.objectToDynamicTables(raw);
    }

    return [];
  }

  private objectToDynamicTables(obj: any, title?: string): DynamicTable[] {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
    const keys = Object.keys(obj);
    if (!keys.length) return [];

    const tables: DynamicTable[] = [];

    const hasNestedArrays = keys.some(k => Array.isArray(obj[k]) && obj[k].length > 0);
    if (hasNestedArrays) {
      for (const key of keys) {
        if (Array.isArray(obj[key]) && obj[key].length > 0 && typeof obj[key][0] === 'object') {
          const headerSet = new Set<string>();
          for (const item of obj[key]) {
            if (item && typeof item === 'object') {
              for (const k of Object.keys(item)) headerSet.add(k);
            }
          }
          const innerHeaders = Array.from(headerSet);
          const allRows = obj[key].map((item: any) => innerHeaders.map((h: string) => this.formatDynamicCellValue(item[h])));
          tables.push({
            title: this.formatTableTitle(key),
            headers: innerHeaders.map((h: string) => this.formatTableTitle(h)),
            rows: allRows,
            totalRows: allRows.length,
          });
        } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          tables.push(...this.objectToDynamicTables(obj[key], this.formatTableTitle(key)));
        }
      }
      return tables;
    }

    const objectEntries = keys.filter(k => typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k]));
    if (objectEntries.length > 0) {
      const subKeySet = new Set<string>();
      for (const k of objectEntries) {
        for (const sk of Object.keys(obj[k])) subKeySet.add(sk);
      }
      const subKeys = Array.from(subKeySet);

      const hasDeepNesting = objectEntries.some(k =>
        subKeys.some(sk => typeof obj[k][sk] === 'object' && obj[k][sk] !== null)
      );

      if (hasDeepNesting) {

        for (const k of objectEntries) {

          if (this.isPlotData(obj[k])) continue;
          tables.push(...this.objectToDynamicTables(obj[k], this.formatTableTitle(k)));
        }

        const primitiveKeys = keys.filter(k =>
          typeof obj[k] !== 'object' || obj[k] === null || Array.isArray(obj[k])
        );
        if (primitiveKeys.length) {
          tables.push({
            title,
            headers: primitiveKeys.map(h => this.formatTableTitle(h)),
            rows: [primitiveKeys.map(k => this.formatDynamicCellValue(obj[k]))],
            totalRows: 1,
          });
        }
        return tables;
      }

      const headers = ['Name', ...subKeys.map(sk => this.formatTableTitle(sk))];
      const rows = objectEntries.map(k => {
        const inner = obj[k];
        return [this.formatTableTitle(k), ...subKeys.map(sk => this.formatDynamicCellValue(inner[sk]))];
      });

      const primitiveKeys = keys.filter(k =>
        typeof obj[k] !== 'object' || obj[k] === null || Array.isArray(obj[k])
      );
      if (primitiveKeys.length) {

        const overlapping = primitiveKeys.filter(pk => subKeys.includes(pk));
        if (overlapping.length > 0) {
          const summaryRow = ['Overall', ...subKeys.map(sk => {
            const pk = overlapping.find(p => p === sk);
            return pk ? this.formatDynamicCellValue(obj[pk]) : '-';
          })];
          if (summaryRow.some((v, i) => i > 0 && v !== '-')) rows.push(summaryRow);
        }

        const nonOverlapping = primitiveKeys.filter(pk => !subKeys.includes(pk));
        if (nonOverlapping.length > 0) {
          tables.push({
            title,
            headers: nonOverlapping.map(h => this.formatTableTitle(h)),
            rows: [nonOverlapping.map(k => this.formatDynamicCellValue(obj[k]))],
            totalRows: 1,
          });
        }
      }

      tables.push({ title, headers, rows, totalRows: rows.length });
      return tables;
    }

    const headers = keys.map(k => this.formatTableTitle(k));
    const row = keys.map(k => this.formatDynamicCellValue(obj[k]));
    tables.push({ title, headers, rows: [row], totalRows: 1 });
    return tables;
  }

  private formatDynamicCellValue(val: any): string {
    if (val == null) return '-';

    if (typeof val === 'string') {
      const trimmed = val.trim();
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed === 'object' && parsed !== null) {
            return this.flattenObjectToString(parsed);
          }
        } catch {  }
      }
      return val;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return '-';
      if (typeof val[0] !== 'object') {
        if (val.length <= 5) return val.map((v: any) =>
          typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v ?? '')
        ).join(', ');
        const displayed = val.slice(0, 3).map((v: any) =>
          typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v ?? '')
        );
        return displayed.join(', ') + ` ... (${val.length} total)`;
      }
      return val.map(v => this.flattenObjectToString(v)).join('; ');
    }
    if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(4);
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return this.flattenObjectToString(val);
    return String(val);
  }

  private flattenObjectToString(obj: any, maxDepth = 2): string {
    if (!obj || typeof obj !== 'object') return String(obj ?? '-');
    if (Array.isArray(obj)) return obj.map(v => typeof v === 'object' ? this.flattenObjectToString(v, maxDepth - 1) : String(v)).join(', ');

    const entries = Object.entries(obj);
    if (!entries.length) return '-';

    return entries.map(([k, v]) => {
      const label = this.formatTableTitle(k);
      if (v == null) return `${label}: -`;
      if (typeof v === 'object' && maxDepth > 0) {
        return `${label}: ${this.flattenObjectToString(v, maxDepth - 1)}`;
      }
      if (typeof v === 'number') return `${label}: ${Number.isInteger(v) ? v : (v as number).toFixed(4)}`;
      return `${label}: ${v}`;
    }).join(', ');
  }

  private isPlotData(obj: any): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const values = Object.values(obj);
    if (values.length === 0) return false;
    return values.every(v => Array.isArray(v) && v.length > 20 && (v.length === 0 || typeof v[0] === 'number'));
  }

  private formatTableTitle(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
