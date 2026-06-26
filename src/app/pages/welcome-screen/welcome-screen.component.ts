import { Component, OnInit, DestroyRef, inject } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ChatHubService } from '../../core/signalr/chat-hub.service';
import { DEFAULT_LLM_SELECTION } from '../../constants/llm-models.constants';
import {
  ConversationContextService,
  QuickMode,
  ActiveChatMode,
} from '../../services/conversation-context.service';
import { FilesService } from '../../services/files.service';
import { PreBuiltWorkflowsService } from '../../services/pre-built-workflows.service';
import { ToastService } from '../../shared/toast/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { AttachedFile } from '../../models/attached-file.model';
import { UploadingFile } from '../../models/uploading-file.model';
import { PreBuiltWorkflow } from '../../models/pre-built-workflow.model';
import { WelcomeTab, isWelcomeTab } from '../../models/welcome-tab.model';
import {
  MODE_DISPLAY_NAMES,
  MODE_ICONS,
  MODE_PLACEHOLDERS,
  MODE_OPTIONS,
  MVP3_UPLOAD_ACCEPT,
  isMvp3UploadAllowed,
} from '../../constants/modes.constants';

import { ChatComposerComponent } from '../../shared/chat-composer/chat-composer.component';

@Component({
  selector: 'app-welcome-screen',
  imports: [CommonModule, FormsModule, ChatComposerComponent],
  templateUrl: './welcome-screen.component.html',
  styleUrls: ['./welcome-screen.component.scss'],
})
export class WelcomeScreenComponent implements OnInit {
  activeTab: WelcomeTab = 'quick';

  attachments: AttachedFile[] = [];
  uploadingFiles: UploadingFile[] = [];

  isSending = false;

  modeSelected = false;
  activeMode: ActiveChatMode | null = null;
  activeModeName: string | null = null;
  activeModeIcon = 'bi-stars';
  isRagMode = false;
  isMvp2Mode = false;
  isReviewerMode = false;

  get composerAccept(): string | null {
    return this.isReviewerMode ? MVP3_UPLOAD_ACCEPT : null;
  }

  private readonly modeIcons = MODE_ICONS;
  private readonly modePlaceholders = MODE_PLACEHOLDERS;

  composerPlaceholder = MODE_PLACEHOLDERS.default;

  readonly modeOptions = MODE_OPTIONS;

  private destroyRef = inject(DestroyRef);

  userName: string | null = null;

  private readonly MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
  composerText = '';

  private uploadGeneration = 0;

  prebuiltWorkflows: PreBuiltWorkflow[] = [];
  prebuiltLoading = false;
  prebuiltLoadError: string | null = null;
  activePrebuiltId: string | null = null;

  constructor(
    private chatHub: ChatHubService,
    private conversationContext: ConversationContextService,
    private router: Router,
    private filesService: FilesService,
    private prebuiltWorkflowsService: PreBuiltWorkflowsService,
    private toast: ToastService,
    private auth: AuthService,
  ) {
    const saved = localStorage.getItem('welcomeActiveTab');
    if (isWelcomeTab(saved)) this.activeTab = saved;
  }

  ngOnInit(): void {
    this.loadPrebuiltWorkflows();

    this.conversationContext.activeMode$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => {
        this.activeMode = mode;
        this.modeSelected = !(
          mode?.kind === 'quick' && mode?.mode === 'default'
        );

        if (mode?.kind === 'quick' && mode?.mode !== 'default') {
          this.activeModeName = this.quickModeLabel(mode.mode);
          this.activeModeIcon = this.modeIcons[mode.mode] || 'bi-stars';
          this.composerPlaceholder =
            this.modePlaceholders[mode.mode] || 'Message AI Workspace...';
          this.isRagMode = mode.mode === 'creative_media';
          this.isMvp2Mode = mode.mode === 'data_analysis';
          this.isReviewerMode = mode.mode === 'super_consultant';
        } else if (mode?.kind === 'specialized') {
          this.activeModeName = mode.name || 'Specialized Mode';
          this.activeModeIcon = 'bi-gear';
          this.composerPlaceholder = 'Message your specialized mode...';
          this.isRagMode = false;
          this.isMvp2Mode = false;
          this.isReviewerMode = false;
        } else {
          this.activeModeName = null;
          this.activeModeIcon = 'bi-stars';
          this.composerPlaceholder = 'Message AI Workspace...';
          this.isRagMode = false;
          this.isMvp2Mode = false;
          this.isReviewerMode = false;
        }
      });

    this.conversationContext.clearCurrent$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.resetDraft();
      });

    this.auth.userName$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((name) => {
        this.userName = name;
      });
  }

  private resetDraft(): void {
    this.uploadGeneration++;
    this.attachments = [];
    this.uploadingFiles = [];
    this.composerText = '';
    this.activePrebuiltId = null;
  }

  setTab(tab: WelcomeTab): void {
    this.activeTab = tab;
    localStorage.setItem('welcomeActiveTab', tab);
  }

  onSelectMode(mode: QuickMode): void {
    this.conversationContext.setActiveQuickMode(mode);

    this.toast.info(
      `${this.quickModeLabel(mode)} mode activated`,
      'Your next message will use this mode.',
    );
  }

  onModeChangeFromDropdown(modeId: string): void {
    this.onSelectMode(modeId as QuickMode);
  }

  quickModeLabel(mode: QuickMode): string {
    return MODE_DISPLAY_NAMES[mode] ?? 'Default';
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
    const gen = this.uploadGeneration;

    this.filesService.uploadFiles(valid).subscribe({
      next: (uploaded) => {
        if (gen !== this.uploadGeneration) return;

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

        if (gen !== this.uploadGeneration) return;

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

      const tempId = crypto.randomUUID();
      this.conversationContext.createConversationFromFirstMessage(
        trimmed,
        tempId,
        attachmentMeta,
      );

      this.router.navigate(['/conversation', tempId]);

      const mode = this.conversationContext.getActiveMode();
      let sendFn: Promise<void>;
      if (mode.kind === 'quick' && mode.mode === 'creative_media') {
        sendFn = this.chatHub.streamRagAssistantMessage(trimmed, null, fileIds);
      } else if (mode.kind === 'quick' && mode.mode === 'super_consultant') {
        sendFn = this.chatHub.streamReviewerAssistantMessage(
          trimmed,
          null,
          fileIds,
        );
      } else {

        const isMvp2 = mode.kind === 'quick' && mode.mode === 'data_analysis';
        sendFn = this.chatHub.streamAssistantMessage(
          trimmed,
          null,
          fileIds,
          isMvp2 ? DEFAULT_LLM_SELECTION : undefined,
        );
      }
      sendFn.catch((err) => console.error('Stream error', err));

      this.conversationContext.setPendingTempId(tempId);
      this.conversationContext
        .waitForSessionCreated(tempId)
        .then((realId) => {
          this.conversationContext.setPendingTempId(null!);
          this.conversationContext.replaceConversationId(tempId, realId);
          this.router.navigate(['/conversation', realId], { replaceUrl: true });
        })
        .catch((err) => {
          console.error('SessionCreated swap failed', err);
        });

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

  onClearAndStartFresh(): void {
    this.conversationContext.clearActiveModeToDefault();
    this.conversationContext.clearSelectedSpecializedMode();
    this.attachments = [];
    this.toast.info('Cleared', 'Mode selection has been reset.');
  }

  private loadPrebuiltWorkflows(): void {
    this.prebuiltLoading = true;
    this.prebuiltLoadError = null;

    this.prebuiltWorkflowsService
      .list(1, 50)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.prebuiltLoading = false;
          if (res?.success && res.data?.items?.length) {
            this.prebuiltWorkflows = res.data.items;
          } else {
            this.prebuiltWorkflows = [];
          }
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

  private prebuiltFileName(wf: PreBuiltWorkflow): string | null {
    if (!wf.filePath) return null;
    const parts = wf.filePath.split(/[/\\]/);
    return parts[parts.length - 1] || wf.filePath;
  }

  onUsePrebuiltWorkflow(wf: PreBuiltWorkflow): void {
    if (this.isSending || this.uploadingFiles.length > 0) {
      this.toast.info('Please wait', 'A previous action is still in progress.');
      return;
    }

    this.activePrebuiltId = wf.id;

    this.conversationContext.setActiveQuickMode('data_analysis');

    this.composerText = this.buildComposerTextFromWorkflow(wf);

    if (wf.fileId) {
      const fileName = this.prebuiltFileName(wf) ?? 'document';
      const attached: AttachedFile = {
        id: `prebuilt_${wf.id}_${wf.fileId}`,
        fileId: wf.fileId,
        name: fileName,
        size: 0,
        blobUrl: null,
      };
      const alreadyAttached = this.attachments.some(
        (a) => a.fileId === wf.fileId,
      );
      this.attachments = alreadyAttached
        ? this.attachments
        : [...this.attachments, attached];
    }

    this.toast.success(
      'Prebuilt workflow loaded',
      'Review the populated message and press send to start.',
    );
  }

  private buildComposerTextFromWorkflow(wf: PreBuiltWorkflow): string {
    return (wf.question ?? '').trim();
  }
}
