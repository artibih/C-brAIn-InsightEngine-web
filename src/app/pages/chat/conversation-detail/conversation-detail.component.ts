import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  HostListener,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';

import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  CombinedResponse,
  SavedConversation,
  Citation,
  AgentStep,
  RagResponse,
} from '../../../models/conversation.models';
import { TypingAnimationDirective } from '../typing-animation.directive';

import { ChatHubService } from '../../../core/signalr/chat-hub.service';
import { DEFAULT_LLM_SELECTION } from '../../../constants/llm-models.constants';
import {
  ConversationContextService,
  QuickMode,
  ConversationTab,
} from '../../../services/conversation-context.service';
import { ReviewerTabId } from '../../../shared/reviewer-output/reviewer-output.component';
import { FilesService } from '../../../services/files.service';
import { PreBuiltWorkflowsService } from '../../../services/pre-built-workflows.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { AttachedFile } from '../../../models/attached-file.model';
import { UploadingFile } from '../../../models/uploading-file.model';
import { PreBuiltWorkflow } from '../../../models/pre-built-workflow.model';

import { ChatComposerComponent } from '../../../shared/chat-composer/chat-composer.component';
import { HideIfTransparentDirective } from '../../../shared/directives/hide-if-transparent.directive';
import { SignedSrcDirective } from '../../../shared/directives/signed-src.directive';
import { FormattedMessageComponent } from '../../../shared/formatted-message/formatted-message.component';
import { CitationTooltipComponent } from '../../../shared/citation-tooltip/citation-tooltip.component';
import {
  CitationTooltipPlacement,
  DEFAULT_CITATION_TOOLTIP_PLACEMENT,
  placeCitationTooltip,
} from '../../../shared/citation-tooltip/citation-tooltip.position';
import { HypothesisResultComponent } from '../../../shared/hypothesis-result/hypothesis-result.component';
import { AnalysisResultsComponent } from '../../../shared/analysis-results/analysis-results.component';
import { ReviewerOutputComponent } from '../../../shared/reviewer-output/reviewer-output.component';
import { MessageFeedbackComponent } from '../../../shared/message-feedback/message-feedback.component';
import {
  ParsedTable,
  parseStructuredResults,
} from '../../../shared/hypothesis-result/structured-results-parser';
import { ChatApiService } from '../../../services/chat-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ReasoningStep } from '../../../models/reasoning-step.model';
import { environment } from '../../../../environments/environment';
import {
  MODE_DISPLAY_NAMES,
  MODE_ICONS,
  MODE_PLACEHOLDERS,
  MODE_OPTIONS,
  MVP3_UPLOAD_ACCEPT,
  isMvp3UploadAllowed,
} from '../../../constants/modes.constants';

@Component({
  selector: 'app-conversation-detail',
  imports: [
    CommonModule,
    TypingAnimationDirective,
    ChatComposerComponent,
    FormattedMessageComponent,
    CitationTooltipComponent,
    HypothesisResultComponent,
    AnalysisResultsComponent,
    ReviewerOutputComponent,
    MessageFeedbackComponent,
    HideIfTransparentDirective,
    SignedSrcDirective,
  ],
  templateUrl: './conversation-detail.component.html',
  styleUrls: ['./conversation-detail.component.scss'],
})
export class ConversationDetailComponent
  implements OnInit, OnDestroy, OnChanges, AfterViewChecked
{
  @Input() conversation: SavedConversation | null = null;
  @Input() isLoading = false;
  @Output() clearAndStartFresh = new EventEmitter<void>();

  @ViewChild('contentArea') private contentArea?: ElementRef<HTMLElement>;
  private shouldScrollToBottom = false;

  activeTab: ConversationTab = 'results';

  expanded: Record<string, boolean> = {};

  attachments: AttachedFile[] = [];
  uploadingFiles: UploadingFile[] = [];
  isSending = false;

  private readonly MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

  private subActiveMode?: Subscription;
  private subActiveTab?: Subscription;
  private subConversations?: Subscription;
  private subCanAccessRefs?: Subscription;
  isDownloading = false;

  reasoningSteps: ReasoningStep[] = [];
  activeModeName = 'Data Synthesis and Literature Analyzer (MVP1)';
  activeModeIcon = 'bi-journal-text';

  isRagMode = false;
  isMvp2Mode = false;
  isReviewerMode = false;


  get composerAccept(): string | null {
    return this.isReviewerMode ? MVP3_UPLOAD_ACCEPT : null;
  }

  composerText = '';
  prebuiltWorkflows: PreBuiltWorkflow[] = [];
  prebuiltLoading = false;
  prebuiltLoadError: string | null = null;
  activePrebuiltId: string | null = null;

  showCitationTooltip = false;
  citationTooltipPosition: CitationTooltipPlacement =
    DEFAULT_CITATION_TOOLTIP_PLACEMENT;
  activeCitation: Citation | null = null;
  currentResponseCitations: Citation[] = [];

  canAccessReferences = false;

  private readonly modeDisplayNames = MODE_DISPLAY_NAMES;
  private readonly modeIcons = MODE_ICONS;
  private readonly modePlaceholders = MODE_PLACEHOLDERS;

  composerPlaceholder = MODE_PLACEHOLDERS.data_analysis;

  readonly modeOptions = MODE_OPTIONS;

  onModeChangeFromDropdown(modeId: string): void {
    this.conversationContext.setActiveQuickMode(modeId as QuickMode);
  }

  switchTab(tab: ConversationTab): void {
    this.conversationContext.setActiveTab(tab);
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatHub: ChatHubService,
    private conversationContext: ConversationContextService,
    private filesService: FilesService,
    private prebuiltWorkflowsService: PreBuiltWorkflowsService,
    private toast: ToastService,
    private chatApi: ChatApiService,
    private sanitizer: DomSanitizer,
    private auth: AuthService,
  ) {}


  sanitizeHtml(text: string): SafeHtml {
    if (!text) return '';
    const clean = text.replace(
      /<(?!\/?(?:i|b|em|strong|sub|sup)\b)[^>]*>/gi,
      '',
    );
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }

  onTableCitationClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const link = target.closest('.citation-link') as HTMLElement | null;
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    const citationNum = link.getAttribute('data-citation');
    if (citationNum) {
      const num = Number(citationNum);
      const rect = link.getBoundingClientRect();
      this.citationTooltipPosition = placeCitationTooltip(rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      this.findAndShowCitation(num);
    }
  }

  formatCellWithCitations(text: string): SafeHtml {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = html.replace(/\*{2}(.+?)\*{2}/g, '<strong>$1</strong>');
    html = html.replace(/\[([\d]+(?:\s*,\s*\d+)*)\]/g, (_match, inner) => {
      const nums = inner
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s);
      return nums
        .map(
          (num: string) =>
            `<a class="citation-link" href="#" data-citation="${num}" title="View source ${num}" role="button"><span class="citation-link__number">${num}</span></a>`,
        )
        .join('');
    });
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversation'] && this.conversation) {
      this.shouldScrollToBottom = true;
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.contentArea?.nativeElement) {
      const el = this.contentArea.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScrollToBottom = false;
    }
  }

  ngOnInit(): void {

    this.subCanAccessRefs = this.auth.canAccessReferences$.subscribe((can) => {
      this.canAccessReferences = can;
    });

    this.subActiveMode = this.conversationContext.activeMode$.subscribe(
      (mode) => {
        if (mode.kind === 'quick') {
          this.activeModeName =
            this.modeDisplayNames[mode.mode] || 'AI Assistant';
          this.activeModeIcon = this.modeIcons[mode.mode] || 'bi-stars';
          this.composerPlaceholder =
            this.modePlaceholders[mode.mode] || 'Message AI Workspace...';
          this.isRagMode = mode.mode === 'creative_media';
          this.isMvp2Mode = mode.mode === 'data_analysis';
          this.isReviewerMode = mode.mode === 'super_consultant';
        } else if (mode.kind === 'specialized') {
          this.activeModeName = mode.name || 'Specialized Mode';
          this.activeModeIcon = 'bi-gear';
          this.composerPlaceholder = 'Message your specialized mode...';
          this.isRagMode = false;
          this.isMvp2Mode = false;
          this.isReviewerMode = false;
        }
      },
    );

    this.loadPrebuiltWorkflows();

    this.subActiveTab = this.conversationContext.activeTab$.subscribe((tab) => {
      this.activeTab = tab;
    });

    this.subConversations = this.conversationContext.conversations$.subscribe(
      (convs) => {
        const sid = this.sessionId;
        if (!sid) return;

        const conv = convs.find((c) => c.id === sid);
        if (!conv) return;

        const allSteps: AgentStep[] = [];
        for (const r of conv.combinedResponses) {
          if (r.agentSteps) allSteps.push(...r.agentSteps);
        }

        const lastStep = allSteps[allSteps.length - 1];
        const prevLast = this.reasoningSteps[this.reasoningSteps.length - 1];
        if (
          allSteps.length === this.reasoningSteps.length &&
          lastStep?.status === prevLast?.status &&
          lastStep?.message === prevLast?.description?.split(' — ')[1]
        ) {
          return;
        }

        this.reasoningSteps = allSteps.map((s, i) => ({
          index: i,
          description: `${this.formatAgentName(s.agent)} — ${s.message}`,
          status:
            s.status === 'running'
              ? 'running'
              : s.status === 'failed'
                ? 'failed'
                : 'completed',
        }));
      },
    );
  }

  ngOnDestroy(): void {
    this.subActiveMode?.unsubscribe();
    this.subActiveTab?.unsubscribe();
    this.subConversations?.unsubscribe();
    this.subCanAccessRefs?.unsubscribe();
  }

  @HostListener('window:citationClick', ['$event'])
  onCitationClick(event: Event): void {
    this.handleCitationClick(event as CustomEvent<number>);
  }

  private handleCitationClick(event: CustomEvent): void {
    const detail = event.detail;
    const citationIndex: number =
      typeof detail === 'number' ? detail : detail?.index;
    const rect:
      | { left: number; right: number; top: number; bottom: number }
      | undefined = typeof detail === 'object' ? detail?.rect : undefined;
    const responseId: string | undefined =
      typeof detail === 'object' ? detail?.responseId : undefined;

    if (rect) {
      this.citationTooltipPosition = placeCitationTooltip(rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    this.findAndShowCitation(citationIndex, responseId);
  }

  private findAndShowCitation(index: number, responseId?: string): void {
    let citation: Citation | undefined;

    if (this.conversation?.combinedResponses) {
      if (responseId) {
        const target = this.conversation.combinedResponses.find(
          (r) => r.id === responseId,
        );
        if (target?.citations) {
          citation = target.citations.find((c) => c.index === index);
        }
      }

      if (!citation) {
        for (const response of this.conversation.combinedResponses) {
          if (response.citations) {
            citation = response.citations.find((c) => c.index === index);
            if (citation) break;
          }
        }
      }
    }

    if (!citation) return;

    this.activeCitation = citation as Citation;
    this.showCitationTooltip = true;
  }

  closeCitationTooltip(): void {
    this.showCitationTooltip = false;
    this.activeCitation = null;
  }

  onCitationOpenPdf(citation: Citation): void {
    if (citation.internalPdfUrl) {
      const w = window.open(
        citation.internalPdfUrl,
        '_blank',
        'noopener,noreferrer',
      );
      if (w) w.opener = null;
    }
  }

  resolvingPaperUrls = new Set<string>();

  onOpenPaperUrl(citation: Citation): void {
    const paperUrl = citation.paperUrl;
    if (!paperUrl || this.resolvingPaperUrls.has(paperUrl)) return;

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

    this.resolvingPaperUrls.add(paperUrl);
    this.filesService.getDownloadUrl(paperUrl).subscribe({
      next: (signedUrl) => {
        this.resolvingPaperUrls.delete(paperUrl);
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
        this.resolvingPaperUrls.delete(paperUrl);
        win?.close();
        console.error('Paper download URL request failed', err);
        this.toast.error(
          'Open failed',
          'Could not retrieve a download link for this paper.',
        );
      },
    });
  }

  onCitationOpenDoi(citation: Citation): void {
    if (citation.doi) {
      const w = window.open(
        `https://doi.org/${citation.doi}`,
        '_blank',
        'noopener,noreferrer',
      );
      if (w) w.opener = null;
    } else if (citation.pubmedId) {
      const w = window.open(
        `https://pubmed.ncbi.nlm.nih.gov/${citation.pubmedId}`,
        '_blank',
        'noopener,noreferrer',
      );
      if (w) w.opener = null;
    }
  }

  getStepIcon(status: ReasoningStep['status']): string {
    switch (status) {
      case 'completed':
        return 'bi-check-circle-fill';
      case 'running':
        return 'bi-arrow-repeat';
      case 'pending':
        return 'bi-circle';
      case 'failed':
        return 'bi-x-circle-fill';
      default:
        return 'bi-circle';
    }
  }

  toggleExpanded(id: string): void {
    this.expanded[id] = !this.expanded[id];
  }

  get sessionId(): string | null {
    return this.conversation?.id ?? this.route.snapshot.paramMap.get('id');
  }
  private getFilenameFromContentDisposition(
    cd: string | null,
    fallback: string,
  ): string {
    if (!cd) return fallback;

    const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cd);
    if (utf8?.[1]) return decodeURIComponent(utf8[1].trim().replace(/"/g, ''));

    const simple = /filename\s*=\s*("?)([^";]+)\1/i.exec(cd);
    if (simple?.[2]) return simple[2].trim();

    return fallback;
  }

  async onDownloadDocx(): Promise<void> {
    const id = this.sessionId;
    if (!id || this.isDownloading) return;

    this.isDownloading = true;

    try {
      const res = await firstValueFrom(
        this.chatApi.downloadConversationDocx(id),
      );

      const blob = res.body;
      if (!blob) {
        this.toast.error('Download failed', 'Empty file received from server.');
        return;
      }

      const cd = res.headers.get('content-disposition');
      const fallbackName = `conversation-${id}.docx`;
      const filename = this.getFilenameFromContentDisposition(cd, fallbackName);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      this.toast.info('Download started', 'Your .docx file is downloading.');
    } catch (err) {
      console.error('DOCX download failed', err);
      this.toast.error(
        'Download failed',
        'Could not download the .docx document.',
      );
    } finally {
      this.isDownloading = false;
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.onFilesChosen(files);
  }
  onFilesChosen(files: File[]): void {
    if (!files || files.length === 0) return;

    const valid: File[] = [];
    const now = Date.now();

    for (const f of files) {
      if (f.size > this.MAX_UPLOAD_BYTES) {
        this.toast.error('Upload blocked', 'File must be 100 MB or smaller.');
        continue;
      }
      if (this.isReviewerMode && !isMvp3UploadAllowed(f.name)) {
        this.toast.error(
          'Unsupported file type',
          `“${f.name}” was skipped. Reviewer Three accepts PDF, ZIP, TeX, and DOCX files.`,
        );
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;

    const uploading: UploadingFile[] = valid.map((file, index) => ({
      id: `${now}_${index}_${file.name}`,
      name: file.name,
      size: file.size,
    }));

    this.uploadingFiles = [...this.uploadingFiles, ...uploading];

    this.filesService.uploadFiles(valid).subscribe({
      next: (uploaded) => {
        const uploadingIds = new Set(uploading.map((u) => u.id));
        this.uploadingFiles = this.uploadingFiles.filter(
          (u) => !uploadingIds.has(u.id),
        );

        const newAttachments: AttachedFile[] = [];
        const assigned = new Set<string>();

        for (const u of uploaded) {
          const match = uploading.find(
            (x) =>
              !assigned.has(x.id) &&
              x.name === u.fileName &&
              x.size === u.sizeBytes,
          );
          if (!match) continue;

          assigned.add(match.id);

          newAttachments.push({
            id: match.id,
            fileId: u.fileId,
            name: u.fileName,
            size: u.sizeBytes,
            blobUrl: u.blobUrl,
          });
        }

        this.attachments = [...this.attachments, ...newAttachments];
      },

      error: (err: unknown) => {
        console.error('Upload failed', err);

        let backendMsg = 'Upload failed.';
        if (err instanceof HttpErrorResponse) {
          backendMsg =
            err.error?.message ||
            err.error?.error?.message ||
            err.message ||
            backendMsg;
        }

        this.toast.error('Upload error', backendMsg);

        const uploadingIds = new Set(uploading.map((u) => u.id));
        this.uploadingFiles = this.uploadingFiles.filter(
          (u) => !uploadingIds.has(u.id),
        );
      },
    });
  }

  removeAttachment(id: string): void {
    this.attachments = this.attachments.filter((f) => f.id !== id);
  }

  private loadPrebuiltWorkflows(): void {
    this.prebuiltLoading = true;
    this.prebuiltLoadError = null;

    this.prebuiltWorkflowsService.list(1, 50).subscribe({
      next: (res) => {
        this.prebuiltLoading = false;
        this.prebuiltWorkflows =
          res?.success && res.data?.items ? res.data.items : [];
      },
      error: (err: unknown) => {
        this.prebuiltLoading = false;
        this.prebuiltWorkflows = [];
        let msg = 'Could not load prebuilt workflows.';
        if (err instanceof HttpErrorResponse) {
          msg =
            err.error?.message ||
            err.error?.error?.message ||
            err.message ||
            msg;
        }
        this.prebuiltLoadError = msg;
        console.error('Prebuilt workflows load failed', err);
      },
    });
  }

  onUsePrebuiltWorkflow(wf: PreBuiltWorkflow): void {
    if (this.isSending || this.uploadingFiles.length > 0) {
      this.toast.info('Please wait', 'A previous action is still in progress.');
      return;
    }

    this.activePrebuiltId = wf.id;
    this.conversationContext.setActiveQuickMode('data_analysis');

    this.composerText = (wf.question ?? '').trim();

    if (wf.fileId) {
      const parts = (wf.filePath ?? '').split(/[/\\]/);
      const fileName = parts[parts.length - 1] || wf.filePath || 'document';
      const already = this.attachments.some((a) => a.fileId === wf.fileId);
      if (!already) {
        this.attachments = [
          ...this.attachments,
          {
            id: `prebuilt_${wf.id}_${wf.fileId}`,
            fileId: wf.fileId,
            name: fileName,
            size: 0,
            blobUrl: null,
          },
        ];
      }
    }

    this.toast.success(
      'Prebuilt workflow loaded',
      'Review the populated message and press send to start.',
    );
  }

  private sendMessage(
    message: string,
    sessionId: string | null,
    fileIds: string[] | null,
  ): Promise<void> {
    const mode = this.conversationContext.getActiveMode();
    if (mode.kind === 'quick' && mode.mode === 'creative_media') {
      return this.chatHub.streamRagAssistantMessage(
        message,
        sessionId,
        fileIds,
      );
    }
    if (mode.kind === 'quick' && mode.mode === 'super_consultant') {
      return this.chatHub.streamReviewerAssistantMessage(
        message,
        sessionId,
        fileIds,
      );
    }

    const isMvp2 = mode.kind === 'quick' && mode.mode === 'data_analysis';
    return this.chatHub.streamAssistantMessage(
      message,
      sessionId,
      fileIds,
      isMvp2 ? DEFAULT_LLM_SELECTION : undefined,
    );
  }

  async onSendFromInput(message: string): Promise<void> {
    const trimmed = String(message ?? '').trim();
    if (!trimmed || this.isSending) return;

    if (this.uploadingFiles.length > 0) {
      this.toast.info('Please wait', 'File upload is still in progress.');
      return;
    }

    this.isSending = true;

    try {
      const attachmentFileIds = this.attachments
        .map((a) => a.fileId)
        .filter((id): id is string => !!id);
      const fileIds = attachmentFileIds.length ? attachmentFileIds : null;

      const attachmentMeta = this.attachments.length
        ? this.attachments.map((a) => ({ name: a.name, size: a.size }))
        : undefined;

      const sid = this.sessionId;

      if (sid) {
        this.conversationContext.setActiveConversation(sid);
        this.conversationContext.addUserTurn(sid, trimmed, attachmentMeta);
        this.sendMessage(trimmed, sid, fileIds).catch((err) =>
          console.error('StreamAssistant error', err),
        );
      } else {

        const tempId = crypto.randomUUID();
        this.conversationContext.createConversationFromFirstMessage(
          trimmed,
          tempId,
          attachmentMeta,
        );
        this.router.navigate(['/conversation', tempId]);

        this.sendMessage(trimmed, null, fileIds).catch((err) =>
          console.error('StreamAssistant error', err),
        );

        this.conversationContext.setPendingTempId(tempId);
        this.conversationContext
          .waitForSessionCreated(tempId)
          .then((realId) => {
            this.conversationContext.setPendingTempId(null!);
            this.conversationContext.replaceConversationId(tempId, realId);
            this.router.navigate(['/conversation', realId], {
              replaceUrl: true,
            });
          })
          .catch((err) => {
            console.error('SessionCreated swap failed', err);

          });
      }

      this.attachments = [];
    } catch (err) {
      console.error('Send failed', err);
      this.toast.error(
        'Send failed',
        'Could not send your message. Please try again.',
      );
    } finally {
      this.isSending = false;
    }
  }

  onRetryLastMessage(response: CombinedResponse): void {
    const message = response.userMessage?.content;
    if (!message?.trim()) return;

    response.streamError = undefined;
    response.synthesizedResponse = '';
    response.isStreaming = true;

    const sid = this.sessionId;
    this.sendMessage(message, sid, null).catch((err) => {
      console.error('Retry failed', err);
      this.toast.error('Retry failed', 'Could not resend your message.');
      response.isStreaming = false;
    });
  }

  get allCitations(): Citation[] {
    if (!this.conversation?.combinedResponses) return [];
    const citations: Citation[] = [];
    const seen = new Set<string>();

    for (const r of this.conversation.combinedResponses) {
      if (!r.citations) continue;
      for (const c of r.citations) {
        const key = this.citationDeduplicationKey(c);
        if (seen.has(key)) continue;
        seen.add(key);
        citations.push(c);
      }
    }
    return citations;
  }

  private citationDeduplicationKey(c: Citation): string {
    if (c.doi) return 'doi:' + c.doi.toLowerCase().trim();
    const title = (c.title || '').toLowerCase().trim();
    if (title) return 'title:' + title;
    return c.id;
  }

  get hasHypothesisResponse(): boolean {
    if (!this.conversation?.combinedResponses) return false;
    return this.conversation.combinedResponses.some((r) =>
      this.isHypothesisResponse(r),
    );
  }

  isRagResponse(response: CombinedResponse): boolean {
    return !!response.ragResponse?.answer;
  }

  isHypothesisResponse(response: CombinedResponse): boolean {
    return !!response.agentSteps?.some(
      (s) => s.agent === 'hypothesis_planner' && s.data?.analysis_steps,
    );
  }

  isAnalysisResponse(response: CombinedResponse): boolean {
    return !!response.agentSteps?.some(
      (s) =>
        s.agent === 'statistical_executor' ||
        s.agent === 'synthesizer' ||
        s.agent === 'critical' ||
        s.agent === 'critique_agent',
    );
  }

  isReviewerResponse(response: CombinedResponse): boolean {
    const ro = response.reviewerOutput;
    if (!ro) return false;
    return !!(
      ro.review_journal_editor ||
      ro.review_methodological ||
      ro.review_domain_expert ||
      ro.review_benchmark_evidence ||
      ro.final_review
    );
  }

  isResultsLikeTab(tab: ConversationTab): boolean {
    return tab === 'results' || tab.startsWith('reviewer_');
  }

  reviewerActiveTab(tab: ConversationTab): ReviewerTabId {
    if (
      tab === 'reviewer_final' ||
      tab === 'reviewer_journal_editor' ||
      tab === 'reviewer_methodological' ||
      tab === 'reviewer_domain_expert' ||
      tab === 'reviewer_benchmark_evidence'
    ) {
      return tab;
    }
    return 'reviewer_final';
  }

  formatMessageTime(date: Date | string | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return (
      d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
    );
  }

  formatAgentName(agent: string): string {
    return agent
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  getAgentStepIcon(status: string): string {
    switch (status) {
      case 'completed':
        return 'bi-check-circle-fill';
      case 'running':
        return 'bi-arrow-repeat';
      default:
        return 'bi-circle';
    }
  }

  getExecutionAgentSteps(response: CombinedResponse): AgentStep[] {
    if (!response.agentSteps) return [];
    return response.agentSteps.filter(
      (s) => s.agent !== 'hypothesis_planner' && s.agent !== 'initialized',
    );
  }


  getStepLabel(response: CombinedResponse, step: AgentStep): string {
    const hasPlanner =
      this.isHypothesisResponse(response) ||
      this.hasHypothesisPlannerStep(response);
    const base = hasPlanner ? 1 : 0;

    const role = this.getAgentRole(step.agent);

    if (role === 'execution') {
      const num = String(base + 1).padStart(2, '0');
      return step.stepId ? `${num} – ${step.stepId}` : num;
    }
    if (role === 'synthesizer') return String(base + 2).padStart(2, '0');
    if (role === 'claim_extractor') return String(base + 3).padStart(2, '0');
    if (role === 'hallucination_detector')
      return String(base + 4).padStart(2, '0');
    if (role === 'critique') return String(base + 5).padStart(2, '0');

    return String(base + 1).padStart(2, '0');
  }

  private getAgentRole(
    agent: string,
  ):
    | 'execution'
    | 'synthesizer'
    | 'claim_extractor'
    | 'hallucination_detector'
    | 'critique'
    | 'other' {
    const normalized = (agent ?? '').toLowerCase().replace(/_/g, '');
    if (
      [
        'knowledgeretriever',
        'statisticalexecutor',
        'retrieval',
        'statistics',
      ].includes(normalized)
    )
      return 'execution';
    if (normalized.includes('synthe')) return 'synthesizer';
    if (normalized.includes('claimextract')) return 'claim_extractor';
    if (normalized.includes('hallucinationdetect'))
      return 'hallucination_detector';
    if (normalized.includes('critiqu') || normalized.includes('critical'))
      return 'critique';
    return 'other';
  }


  getStepHeaderTitle(step: AgentStep): string {
    if (this.getAgentRole(step.agent) === 'execution') {
      return step.stepText || step.message || this.formatAgentName(step.agent);
    }

    return this.formatAgentName(step.agent);
  }

  hasHypothesisPlannerStep(response: CombinedResponse): boolean {
    return !!response.agentSteps?.some((s) => s.agent === 'hypothesis_planner');
  }

  getAgentDataSummary(step: AgentStep): string {
    if (!step.data) return '';
    const d = step.data;

    if (step.agent === 'knowledge_retriever') {
      if (d.retrieved_knowledge) {
        return String(d.retrieved_knowledge).replace(/^\[S\d+\]\s*/, '');
      }
      if (d.step_results) {
        const entries = Object.entries(d.step_results);
        if (entries.length === 0) return '';
        return entries
          .map(([_id, val]: [string, any]) =>
            String(val?.retrieved_knowledge ?? '').replace(/^\[S\d+\]\s*/, ''),
          )
          .join('\n\n');
      }
    }

    if (step.agent === 'synthesizer') {
      if (Array.isArray(d.findings) && d.findings.length > 0) {
        return d.findings
          .map((f: any) => {
            const detail = f.detail ?? '';
            if (!detail) return '';
            const cit = f.citation;
            if (cit && typeof cit === 'object') {
              const citNum = cit.citation_number ?? cit.citationNumber;
              if (citNum != null) return `${detail} [${citNum}]`;
            }
            return detail;
          })
          .filter((s: string) => !!s)
          .join('\n\n');
      }
      if (d.summary) return String(d.summary);
    }

    if (step.agent === 'critique_agent' || step.agent === 'critical') {
      const lines: string[] = [];
      if (d.needs_revision != null) {
        lines.push(`Needs revision: ${d.needs_revision ? 'Yes' : 'No'}`);
      }

      const issues: any[] = Array.isArray(d.issues) ? d.issues : [];
      const issueStrings = issues
        .map((i: any) =>
          typeof i === 'string'
            ? i
            : (i?.description ?? i?.text ?? i?.message ?? JSON.stringify(i)),
        )
        .filter((s: string) => !!s);
      if (issueStrings.length > 0) {
        lines.push(
          'Issues:\n' + issueStrings.map((s: string) => `  - ${s}`).join('\n'),
        );
      } else {
        lines.push('Issues: —');
      }

      const rawStrengths: any[] = Array.isArray(d.strengths) ? d.strengths : [];
      const strengths = rawStrengths
        .map((s: any) => (typeof s === 'string' ? s : String(s)))
        .filter((s: string) => !!s.trim());
      if (strengths.length > 0) {
        lines.push(
          'Strengths:\n' + strengths.map((s: string) => `  - ${s}`).join('\n'),
        );
      } else {
        lines.push('Strengths: —');
      }

      const validationSummary = d.validation_summary ?? '';
      lines.push(`Validation Summary: ${validationSummary || '—'}`);

      return lines.join('\n\n');
    }

    if (step.agent === 'claim_extractor') {
      const parts: string[] = [];
      if (d.total_claims != null) parts.push(`Total Claims: ${d.total_claims}`);
      return parts.join('\n');
    }

    if (step.agent === 'hallucination_detector') {
      const parts: string[] = [];
      const s = d.summary;
      if (s && typeof s === 'object') {
        if (s.total_claims != null)
          parts.push(`Total Claims: ${s.total_claims}`);
        if (s.entailed != null) parts.push(`Entailed: ${s.entailed}`);
        if (s.contradicted != null)
          parts.push(`Contradicted: ${s.contradicted}`);
        if (s.neutral != null) parts.push(`Neutral: ${s.neutral}`);
        if (s.hallucination_risk_score != null) {
          const score =
            typeof s.hallucination_risk_score === 'number'
              ? `${(s.hallucination_risk_score * 100).toFixed(1)}%`
              : s.hallucination_risk_score;
          parts.push(`Hallucination Risk: ${score}`);
        }
      }
      if (Array.isArray(d.verdicts) && d.verdicts.length > 0) {
        for (const v of d.verdicts) {
          const verdict = v.verdict ?? 'unknown';
          const conf =
            v.confidence_score != null
              ? ` (${(v.confidence_score * 100).toFixed(0)}%)`
              : '';
          const claimText = v.claim_text
            ? `"${v.claim_text}"`
            : `Claim ${v.claim_id ?? ''}`;
          parts.push(`  ${verdict.toUpperCase()}${conf}: ${claimText}`);
        }
      }
      return parts.join('\n');
    }

    if (step.agent === 'statistical_executor') {
      const parts: string[] = [];
      if (d.summary) parts.push(d.summary);
      if (d.structured_results) {
        if (
          Array.isArray(d.structured_results) &&
          d.structured_results.length > 0
        ) {
          parts.push(`${d.structured_results.length} statistical results`);
        } else if (
          typeof d.structured_results === 'object' &&
          Object.keys(d.structured_results).length > 0
        ) {
          parts.push(this.flattenDataToSummary(d.structured_results));
        }
      }
      if (
        Array.isArray(d.generated_artifacts) &&
        d.generated_artifacts.length > 0
      ) {
        parts.push(
          `${d.generated_artifacts.length} ${d.generated_artifacts.length === 1 ? 'chart' : 'charts'} generated`,
        );
      }
      if (parts.length > 0) return parts.join('\n');
    }

    return this.extractGenericSummary(d);
  }

  private extractGenericSummary(d: any): string {
    if (!d || typeof d !== 'object') return '';

    if (d.output) {
      const out = d.output;
      if (typeof out === 'string') {
        const trimmed = out.trim();
        if (trimmed.startsWith('{') && trimmed.length > 2) {
          try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed === 'object' && parsed !== null) {
              return this.flattenDataToSummary(parsed);
            }
          } catch {

          }
        }
        if (trimmed) return trimmed;
      }
      if (typeof out === 'object' && Object.keys(out).length > 0) {
        return this.flattenDataToSummary(out);
      }
    }

    if (d.summary) return String(d.summary);
    if (d.description) return String(d.description);
    if (d.message && typeof d.message === 'string') return d.message;

    const skip = new Set(['status', 'step_id', 'step_text', 'type', 'agent']);
    const parts: string[] = [];
    for (const [key, val] of Object.entries(d)) {
      if (skip.has(key) || val == null) continue;
      if (typeof val === 'string' && val.trim()) {
        parts.push(`${this.formatAgentName(key)}: ${val.trim()}`);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        parts.push(`${this.formatAgentName(key)}: ${val}`);
      } else if (typeof val === 'object') {
        const keyCount = Array.isArray(val)
          ? val.length
          : Object.keys(val).length;
        if (keyCount > 0) {
          parts.push(
            `${this.formatAgentName(key)}: ${Array.isArray(val) ? `${keyCount} items` : `${keyCount} fields`}`,
          );
        }
      }
    }
    return parts.join('\n');
  }

  private flattenDataToSummary(obj: any, maxLines = 15): string {
    if (!obj || typeof obj !== 'object') return String(obj ?? '');
    const lines: string[] = [];

    for (const [key, val] of Object.entries(obj)) {
      if (val == null) continue;
      const label = this.formatAgentName(key);
      if (
        typeof val === 'string' ||
        typeof val === 'number' ||
        typeof val === 'boolean'
      ) {
        lines.push(`${label}: ${val}`);
      } else if (Array.isArray(val)) {
        if (val.length <= 5 && val.every((v) => typeof v !== 'object')) {
          lines.push(`${label}: ${val.join(', ')}`);
        } else {
          lines.push(`${label}: ${val.length} items`);
        }
      } else if (typeof val === 'object') {
        const inner = Object.entries(val)
          .filter(([, v]) => v != null && typeof v !== 'object')
          .map(([k, v]) => `${this.formatAgentName(k)}: ${v}`)
          .join(', ');
        if (inner) {
          lines.push(`${label}: ${inner}`);
        } else {
          lines.push(`${label}: ${Object.keys(val).length} fields`);
        }
      }
      if (lines.length >= maxLines) break;
    }
    return lines.join('\n');
  }

  getStepImageUrls(step: AgentStep): { url: string; label: string }[] {
    if (!step.data) return [];
    const d = step.data;
    const raw: any[] =
      d.generated_artifacts ?? d.artifacts ?? d.images ?? d.image_urls ?? [];
    if (!Array.isArray(raw) || raw.length === 0) return [];

    return raw
      .map((item: any, i: number) => {
        const rawUrl =
          typeof item === 'string' ? item : (item.url ?? item.path ?? '');
        const label =
          typeof item === 'string'
            ? `Chart ${i + 1}`
            : (item.label ?? item.title ?? `Chart ${i + 1}`);
        return { url: this.resolveImageUrl(rawUrl), label };
      })
      .filter((img) => !!img.url);
  }

  private resolveImageUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))
      return rawUrl;
    const base = environment.artifactStorageBaseUrl ?? '';
    if (!base) return rawUrl;
    const separator = base.endsWith('/') || rawUrl.startsWith('/') ? '' : '/';
    return `${base}${separator}${rawUrl}`;
  }

  getStepStructuredTables(step: AgentStep): ParsedTable[] {
    if (!step.data) return [];
    const raw =
      step.data.structured_results ?? step.data.results ?? step.data.output;
    if (!raw) return [];
    return parseStructuredResults(raw) ?? [];
  }

  getAttachmentIcon(att: any): string {
    const name = (att?.name ?? '').toLowerCase();
    const ct = (att?.contentType ?? '').toLowerCase();
    if (name.endsWith('.pdf') || ct.includes('pdf'))
      return 'bi-file-earmark-pdf';
    if (name.endsWith('.zip') || ct.includes('zip'))
      return 'bi-file-earmark-zip';
    if (name.endsWith('.tex') || ct.includes('tex'))
      return 'bi-file-earmark-code';
    if (name.endsWith('.csv') || ct.includes('csv'))
      return 'bi-file-earmark-spreadsheet';
    if (
      name.match(/\.(xlsx?|ods)$/) ||
      ct.includes('spreadsheet') ||
      ct.includes('excel')
    )
      return 'bi-file-earmark-excel';
    if (name.match(/\.(docx?|odt)$/) || ct.includes('word'))
      return 'bi-file-earmark-word';
    if (name.match(/\.(png|jpe?g|gif|svg|webp)$/) || ct.includes('image'))
      return 'bi-file-earmark-image';
    if (name.match(/\.(txt|log|md)$/) || ct.includes('text'))
      return 'bi-file-earmark-text';
    return 'bi-file-earmark';
  }

  formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(k)),
      sizes.length - 1,
    );
    return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
  }

  getProviderName(provider: string): string {
    if (provider === 'gemini') return 'Gemini';
    if (provider === 'openai') return 'ChatGPT';
    if (provider === 'perplexity') return 'Perplexity';
    return provider;
  }

  getProviderClass(provider: string): string {
    switch (provider) {
      case 'gemini':
        return 'provider-badge provider-badge--gemini';
      case 'openai':
        return 'provider-badge provider-badge--openai';
      case 'perplexity':
        return 'provider-badge provider-badge--perplexity';
      default:
        return 'provider-badge';
    }
  }

  trackById(_index: number, item: CombinedResponse): string {
    return item.id;
  }

  canRateResponse(response: CombinedResponse): boolean {
    return (
      !!response.assistantMessageId &&
      !response.isStreaming &&
      !response.streamError
    );
  }

  onFeedbackChanged(
    response: CombinedResponse,
    change: { rating?: number; feedbackComment?: string },
  ): void {
    response.rating = change.rating;
    response.feedbackComment = change.feedbackComment;
  }

  getValidIndividualResponses(response: CombinedResponse) {
    const list = (response?.individualResponses ?? []) as any[];
    return list.filter(
      (r) => typeof r?.content === 'string' && r.content.trim().length > 0,
    );
  }

  getValidModelCount(response: CombinedResponse): number {
    return this.getValidIndividualResponses(response).length;
  }

  async onClearAndStartFresh(): Promise<void> {
    const ok = await this.onClearCurrent();
    if (ok) this.clearAndStartFresh.emit();
  }

  async onClearCurrent(): Promise<boolean> {
    if (this.uploadingFiles.length > 0) {
      this.toast.info('Please wait', 'File upload is still in progress.');
      return false;
    }

    try {
      this.attachments = [];

      this.conversationContext.clearActiveModeToDefault();
      this.conversationContext.clearSelectedSpecializedMode();
      this.conversationContext.resetActive();
      this.chatHub.resetSession();
      await this.router.navigate(['/']);

      this.toast.info(
        'Conversation cleared',
        'Current conversation has been cleared.',
      );
      return true;
    } catch (err) {
      console.error('Clear current failed', err);
      this.toast.error(
        'Clear failed',
        'Something went wrong while clearing the conversation.',
      );
      return false;
    }
  }
}
