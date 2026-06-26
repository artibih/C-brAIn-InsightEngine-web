import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Citation } from '../../models/conversation.models';
import { ToastService } from '../toast/toast.service';
import { FilesService } from '../../services/files.service';
import {
  CitationTooltipPlacement,
  DEFAULT_CITATION_TOOLTIP_PLACEMENT,
} from './citation-tooltip.position';

@Component({
  selector: 'app-citation-tooltip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './citation-tooltip.component.html',
  styleUrls: ['./citation-tooltip.component.scss'],
})
export class CitationTooltipComponent {
  @Input() citation!: Citation;
  @Input() position: CitationTooltipPlacement = DEFAULT_CITATION_TOOLTIP_PLACEMENT;
  @Input() isVisible: boolean = false;
  @Input() userType: 'cbrain' | 'external' = 'external';
  @Input() canAccessReferences: boolean = true;

  @Output() close = new EventEmitter<void>();
  @Output() openPdf = new EventEmitter<Citation>();
  @Output() openDoi = new EventEmitter<Citation>();

  isResolvingPaperUrl = false;

  private readonly ACCESS_DENIED_MSG =
    'Your account does not have access to reference content.';

  constructor(
    private elementRef: ElementRef,
    private toast: ToastService,
    private filesService: FilesService,
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (
      this.isVisible &&
      !this.elementRef.nativeElement.contains(event.target)
    ) {
      this.close.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isVisible) {
      this.close.emit();
    }
  }

  
  get isFlippedAbove(): boolean {
    return this.position.bottom !== null;
  }

  get formattedAuthors(): string {
    if (!this.citation?.authors?.length) return '';
    if (this.citation.authors.length === 1) return this.citation.authors[0];
    if (this.citation.authors.length === 2)
      return this.citation.authors.join(' & ');
    return `${this.citation.authors[0]} et al.`;
  }

  get relevancePercentage(): number {
    return Math.round((this.citation?.relevanceScore || 0) * 100);
  }

  onOpenPdf(): void {
    if (!this.canAccessReferences) {
      this.toast.info('Access restricted', this.ACCESS_DENIED_MSG);
      return;
    }
    if (this.citation.internalPdfUrl) {
      this.openPdf.emit(this.citation);
    }
  }

  onOpenPaperUrl(): void {
    if (!this.canAccessReferences) {
      this.toast.info('Access restricted', this.ACCESS_DENIED_MSG);
      return;
    }
    const paperUrl = this.citation.paperUrl;
    if (!paperUrl || this.isResolvingPaperUrl) return;

    
    if (!FilesService.isPrivateBlobUrl(paperUrl)) {
      const direct = window.open(paperUrl, '_blank', 'noopener,noreferrer');
      if (direct) direct.opener = null;
      return;
    }

    
    
    
    
    const win = window.open('about:blank', '_blank');
    if (win) {
      try {
        (win as any).opener = null;
      } catch {
        
      }
    }

    this.isResolvingPaperUrl = true;
    this.filesService.getDownloadUrl(paperUrl).subscribe({
      next: (signedUrl) => {
        this.isResolvingPaperUrl = false;
        if (!signedUrl) {
          win?.close();
          this.toast.error(
            'Open failed',
            'Could not retrieve a download link for this paper.',
          );
          return;
        }
        if (win && !win.closed) {
          win.location.replace(signedUrl);
        } else {
          window.open(signedUrl, '_blank', 'noopener,noreferrer');
        }
      },
      error: (err) => {
        this.isResolvingPaperUrl = false;
        win?.close();
        console.error('Paper download URL request failed', err);
        this.toast.error(
          'Open failed',
          'Could not retrieve a download link for this paper.',
        );
      },
    });
  }

  onOpenDoi(): void {
    if (!this.canAccessReferences) {
      this.toast.info('Access restricted', this.ACCESS_DENIED_MSG);
      return;
    }
    if (this.citation.doi) {
      window.open(`https://doi.org/${this.citation.doi}`, '_blank');
      this.openDoi.emit(this.citation);
    } else if (this.citation.pubmedId) {
      window.open(
        `https://pubmed.ncbi.nlm.nih.gov/${this.citation.pubmedId}`,
        '_blank',
      );
      this.openDoi.emit(this.citation);
    }
  }

  copyDoiLink(): void {
    if (this.citation.doi) {
      navigator.clipboard.writeText(`https://doi.org/${this.citation.doi}`);
      this.toast.success('Link copied to clipboard');
    }
  }

  




  onOpenWithHighlight(): void {
    if (!this.canAccessReferences) {
      this.toast.info('Access restricted', this.ACCESS_DENIED_MSG);
      return;
    }
    const url = this.buildHighlightUrl();
    if (url) {
      window.open(url, '_blank');
    }
  }

  



  private buildHighlightUrl(): string | null {
    const citation = this.citation;

    
    const sourceType = citation.sourceType || this.inferSourceType(citation);

    
    if (sourceType === 'web' && citation.url) {
      if (citation.highlightText) {
        const textFragment = this.buildTextFragment(citation.highlightText);
        return `${citation.url}#:~:text=${textFragment}`;
      }
      return citation.url;
    }

    
    if (sourceType === 'pdf' && citation.internalPdfUrl) {
      let url = citation.internalPdfUrl;
      const params: string[] = [];

      if (citation.highlightPage) {
        params.push(`page=${citation.highlightPage}`);
      }
      if (citation.highlightText) {
        params.push(`search=${encodeURIComponent(citation.highlightText)}`);
      }

      return params.length > 0 ? `${url}#${params.join('&')}` : url;
    }

    
    if (citation.url) {
      if (citation.highlightText) {
        const textFragment = this.buildTextFragment(citation.highlightText);
        return `${citation.url}#:~:text=${textFragment}`;
      }
      return citation.url;
    }

    if (citation.internalPdfUrl) {
      return citation.internalPdfUrl;
    }

    
    if (citation.doi) {
      return `https://doi.org/${citation.doi}`;
    }

    
    if (citation.pubmedId) {
      return `https://pubmed.ncbi.nlm.nih.gov/${citation.pubmedId}`;
    }

    return null;
  }

  


  private inferSourceType(
    citation: Citation,
  ): 'pdf' | 'web' | 'pubmed' | 'doi' {
    if (citation.url) return 'web';
    if (citation.internalPdfUrl) return 'pdf';
    if (citation.pubmedId) return 'pubmed';
    if (citation.doi) return 'doi';
    return 'web';
  }

  




  private buildTextFragment(highlightText: string): string {
    
    if (highlightText.includes(',')) {
      const parts = highlightText.split(',');
      if (parts.length === 2) {
        const start = encodeURIComponent(parts[0].trim());
        const end = encodeURIComponent(parts[1].trim());
        return `${start},${end}`;
      }
    }

    return encodeURIComponent(highlightText);
  }

  


  get canOpenWithHighlight(): boolean {
    return !!(
      this.citation?.highlightText &&
      (this.citation?.url || this.citation?.internalPdfUrl)
    );
  }

  


  get hasSourceUrl(): boolean {
    return !!(
      this.citation?.url ||
      this.citation?.internalPdfUrl ||
      this.citation?.doi ||
      this.citation?.pubmedId
    );
  }

  


  copyHighlightText(): void {
    if (this.citation?.highlightText) {
      navigator.clipboard.writeText(this.citation.highlightText);
      this.toast.success('Text copied to clipboard');
    }
  }
}
