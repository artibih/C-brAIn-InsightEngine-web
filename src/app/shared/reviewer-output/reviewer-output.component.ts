import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormattedMessageComponent } from '../formatted-message/formatted-message.component';
import { ReviewerOutput } from '../../models/conversation.models';

export type ReviewerTabId =
  | 'reviewer_final'
  | 'reviewer_journal_editor'
  | 'reviewer_methodological'
  | 'reviewer_domain_expert'
  | 'reviewer_benchmark_evidence';

@Component({
  selector: 'app-reviewer-output',
  standalone: true,
  imports: [CommonModule, FormattedMessageComponent],
  templateUrl: './reviewer-output.component.html',
  styleUrls: ['./reviewer-output.component.scss'],
})
export class ReviewerOutputComponent {
  @Input({ required: true }) reviewerOutput!: ReviewerOutput;
  @Input() isStreaming = false;
  
  @Input() activeTab: ReviewerTabId = 'reviewer_final';

  
  isReady(): boolean {
    switch (this.activeTab) {
      case 'reviewer_final':              return !!this.reviewerOutput?.final_review;
      case 'reviewer_journal_editor':     return !!this.reviewerOutput?.review_journal_editor;
      case 'reviewer_methodological':     return !!this.reviewerOutput?.review_methodological;
      case 'reviewer_domain_expert':      return !!this.reviewerOutput?.review_domain_expert;
      case 'reviewer_benchmark_evidence': return !!this.reviewerOutput?.review_benchmark_evidence;
    }
  }

  
  receivedCount(): number {
    const ro = this.reviewerOutput;
    if (!ro) return 0;
    return [
      ro.final_review,
      ro.review_journal_editor,
      ro.review_methodological,
      ro.review_domain_expert,
      ro.review_benchmark_evidence,
    ].filter(Boolean).length;
  }

  
  readonly totalCount = 5;

  
  tabTitle(): string {
    switch (this.activeTab) {
      case 'reviewer_final':              return 'Final Result';
      case 'reviewer_journal_editor':     return 'Journal Editor';
      case 'reviewer_methodological':     return 'Methodological Review';
      case 'reviewer_domain_expert':      return 'Domain Expert Review';
      case 'reviewer_benchmark_evidence': return 'Benchmark & Evidence Review';
    }
  }

  
  loadingSubtitle(): string {
    switch (this.activeTab) {
      case 'reviewer_final':
        return 'Aggregating consensus across all four reviewers and producing the final recommendation.';
      case 'reviewer_journal_editor':
        return 'The journal editor is evaluating clarity, structure, and contribution to the field.';
      case 'reviewer_methodological':
        return 'The methodological reviewer is auditing study design, statistics, and reproducibility.';
      case 'reviewer_domain_expert':
        return 'The domain expert is appraising scientific accuracy, novelty, and field relevance.';
      case 'reviewer_benchmark_evidence':
        return 'The benchmark reviewer is checking each claim against retrieved literature and the knowledge graph.';
    }
  }

  
  evidenceGroundingClass(grounding?: string): string {
    const g = (grounding ?? '').toLowerCase();
    if (g === 'supported' || g === 'strong' || g === 'full')  return 'reviewer-output__verdict--success';
    if (g === 'partial' || g === 'mixed')                     return 'reviewer-output__verdict--warning';
    if (g === 'unsupported' || g === 'none' || g === 'weak' || g === 'contradicted')
      return 'reviewer-output__verdict--danger';
    return 'reviewer-output__verdict--neutral';
  }

  
  evidenceGroundingIcon(grounding?: string): string {
    const g = (grounding ?? '').toLowerCase();
    if (g === 'supported' || g === 'strong' || g === 'full')  return 'bi-shield-check';
    if (g === 'partial' || g === 'mixed')                     return 'bi-shield-exclamation';
    if (g === 'unsupported' || g === 'none' || g === 'weak' || g === 'contradicted')
      return 'bi-shield-x';
    return 'bi-shield';
  }

  
  formatRecommendation(rec?: string): string {
    if (!rec) return '';
    return rec.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  
  recommendationClass(rec?: string): string {
    const r = (rec ?? '').toLowerCase();
    if (r === 'accept' || r === 'accepted')      return 'reviewer-output__verdict--success';
    if (r === 'minor_revision' || r === 'minor') return 'reviewer-output__verdict--warning';
    if (r === 'major_revision' || r === 'major') return 'reviewer-output__verdict--danger';
    if (r === 'reject' || r === 'rejected')      return 'reviewer-output__verdict--danger';
    return 'reviewer-output__verdict--neutral';
  }

  
  recommendationIcon(rec?: string): string {
    const r = (rec ?? '').toLowerCase();
    if (r === 'accept' || r === 'accepted')      return 'bi-check-circle-fill';
    if (r === 'minor_revision' || r === 'minor') return 'bi-pencil-square';
    if (r === 'major_revision' || r === 'major') return 'bi-exclamation-triangle-fill';
    if (r === 'reject' || r === 'rejected')      return 'bi-x-circle-fill';
    return 'bi-circle';
  }
}
