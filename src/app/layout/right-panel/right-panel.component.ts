import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Citation } from '../../models/conversation.models';
import { ToastService } from '../../shared/toast/toast.service';

export type RightPanelTab = 'citations' | 'details';

@Component({
    selector: 'app-right-panel',
    imports: [CommonModule],
    templateUrl: './right-panel.component.html',
    styleUrls: ['./right-panel.component.scss']
})
export class RightPanelComponent {

  @Input() collapsed = false;
  @Input() activeTab: RightPanelTab = 'citations';
  @Input() citations: Citation[] = [];
  @Input() highlightedCitationId: string | null = null;
  @Input() selectedCitation: Citation | null = null;
  @Input() canAccessReferences = true;

  @Output() tabChange = new EventEmitter<RightPanelTab>();
  @Output() collapse = new EventEmitter<void>();
  @Output() citationClick = new EventEmitter<Citation>();
  @Output() citationSelect = new EventEmitter<Citation>();

  private readonly ACCESS_DENIED_MSG = 'Your account does not have access to reference content.';

  constructor(private toast: ToastService) {}

  readonly tabs: { id: RightPanelTab; label: string; icon: string }[] = [
    { id: 'citations', label: 'Citations', icon: 'bi-journal-bookmark' },
    { id: 'details', label: 'Details', icon: 'bi-info-circle' }
  ];

  onTabChange(tab: RightPanelTab): void {
    this.tabChange.emit(tab);
  }

  onToggleCollapse(): void {
    this.collapse.emit();
  }


  onCitationClick(citation: Citation): void {
    this.citationClick.emit(citation);
  }

  onCitationSelect(citation: Citation): void {
    this.citationSelect.emit(citation);
    this.tabChange.emit('details');
  }


  openDoiLink(doi: string): void {
    if (!this.canAccessReferences) {
      this.toast.info('Access restricted', this.ACCESS_DENIED_MSG);
      return;
    }
    if (doi) {
      const newWin = window.open(`https://doi.org/${doi}`, '_blank', 'noopener,noreferrer');
      if (newWin) newWin.opener = null;
    }
  }

  openWithHighlight(citation: Citation): void {
    if (!this.canAccessReferences) {
      this.toast.info('Access restricted', this.ACCESS_DENIED_MSG);
      return;
    }
    const url = this.getHighlightUrl(citation);
    if (url) {
      const newWin = window.open(url, '_blank', 'noopener,noreferrer');
      if (newWin) newWin.opener = null;
    }
  }

  getHighlightUrl(citation: Citation): string | null {
    if (citation.url && citation.highlightText) {
      const fragment = this.buildTextFragment(citation.highlightText);
      return `${citation.url}#:~:text=${fragment}`;
    }

    if (citation.url) {
      return citation.url;
    }

    if (citation.internalPdfUrl) {
      return citation.internalPdfUrl;
    }

    if (citation.doi) {
      return `https://doi.org/${citation.doi}`;
    }

    return null;
  }

  private buildTextFragment(text: string): string {
    if (text.includes(',')) {
      const parts = text.split(',');
      if (parts.length === 2) {
        return `${encodeURIComponent(parts[0].trim())},${encodeURIComponent(parts[1].trim())}`;
      }
    }
    return encodeURIComponent(text);
  }

  canOpenWithHighlight(citation: Citation): boolean {
    return !!(citation.url || citation.internalPdfUrl || citation.doi);
  }

  formatAuthors(authors: string[]): string {
    if (!authors || authors.length === 0) return 'Unknown';
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return authors.join(' & ');
    return `${authors[0]} et al.`;
  }
}
