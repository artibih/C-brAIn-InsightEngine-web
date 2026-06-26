import { CommonModule } from '@angular/common';
import {Component, ElementRef, EventEmitter, HostListener, inject, Input, Output, ViewChild} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InputComponent } from '../input/input.component';
import { LlmSelectorComponent } from '../llm-selector/llm-selector.component';
import { ReviewerParamsSelectorComponent } from '../reviewer-params-selector/reviewer-params-selector.component';
import { AttachedFile } from '../../models/attached-file.model';
import { UploadingFile } from '../../models/uploading-file.model';
import { PreBuiltWorkflow } from '../../models/pre-built-workflow.model';
import { ChatApiService } from '../../services/chat-api.service';
import { ToastService } from '../toast/toast.service';

@Component({
    selector: 'tp-chat-composer',
    imports: [CommonModule, FormsModule, InputComponent, LlmSelectorComponent, ReviewerParamsSelectorComponent],
    templateUrl: './chat-composer.component.html',
    styleUrls: ['./chat-composer.component.scss']
})
export class ChatComposerComponent {
  private chatApi = inject(ChatApiService);
  private toast = inject(ToastService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  @Input() isSending = false;
  @Input() hideAttach = false;

  
  @Input() showLlmSelector = true;

  
  @Input() showReviewerParams = false;

  
  @Input() lockLlmSelector = false;

  
  @Input() accept: string | null = null;

  @Input() uploadingFiles: UploadingFile[] = [];
  @Input() attachments: AttachedFile[] = [];

  
  @Input() activeModeName: string | null = null;
  @Input() activeModeIcon = 'bi-stars';
  @Input() placeholder = 'Message AI Workspace...';
  @Input() modeOptions: { id: string; name: string; icon: string; disabled?: boolean }[] = [];
  @Input() modeDisabled = false;
  @Output() modeChange = new EventEmitter<string>();

  @Input() showPrebuiltWorkflows = false;
  @Input() prebuiltWorkflows: PreBuiltWorkflow[] = [];
  @Input() prebuiltLoading = false;
  @Input() prebuiltLoadError: string | null = null;
  @Input() activePrebuiltId: string | null = null;
  @Output() usePrebuiltWorkflow = new EventEmitter<PreBuiltWorkflow>();

  isPrebuiltDropdownOpen = false;
  isModeDropdownOpen = false;

  togglePrebuiltDropdown(): void {
    this.isPrebuiltDropdownOpen = !this.isPrebuiltDropdownOpen;
    if (this.isPrebuiltDropdownOpen) this.isModeDropdownOpen = false;
  }

  closePrebuiltDropdown(): void {
    this.isPrebuiltDropdownOpen = false;
  }

  selectPrebuiltWorkflow(wf: PreBuiltWorkflow): void {
    this.usePrebuiltWorkflow.emit(wf);
    this.isPrebuiltDropdownOpen = false;
  }

  prebuiltTitle(wf: PreBuiltWorkflow): string {
    const q = (wf.question ?? '').trim();
    if (!q) return 'Untitled workflow';
    return q.length > 80 ? q.slice(0, 80).trimEnd() + '…' : q;
  }

  prebuiltFileName(wf: PreBuiltWorkflow): string | null {
    if (!wf.filePath) return null;
    const parts = wf.filePath.split(/[/\\]/);
    return parts[parts.length - 1] || wf.filePath;
  }

  toggleModeDropdown(): void {
    this.isModeDropdownOpen = !this.isModeDropdownOpen;
    if (this.isModeDropdownOpen) this.isPrebuiltDropdownOpen = false;
  }

  selectMode(modeId: string): void {
    const option = this.modeOptions.find(m => m.id === modeId);
    if (option?.disabled) return;
    this.modeChange.emit(modeId);
    this.isModeDropdownOpen = false;
  }

  closeModeDropdown(): void {
    this.isModeDropdownOpen = false;
  }

  isRefining = false;

  @Output() send = new EventEmitter<string>();

  @Output() attachClick = new EventEmitter<void>();
  @Output() removeAttachment = new EventEmitter<string>();

  @Input() promptText = '';
  @Output() filesDropped = new EventEmitter<File[]>();
  @Output() filesPicked = new EventEmitter<File[]>();
  @Output() filesPasted = new EventEmitter<File[]>();
  isDragActive = false;
  private dragDepth = 0;

  onAttachFiles(): void {
    this.fileInput?.nativeElement.click();
    this.attachClick.emit();
  }

  onFilesSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input?.files ?? []);

    if (files.length) this.filesPicked.emit(files);

    if (input) input.value = '';
  }


  onPromptInput(v: string): void {
    this.promptText = v ?? '';
  }


  onSend(v: string): void {
    this.send.emit(v);

    this.promptText = '';
  }


  fileIcon(name: string): string {
    const n = (name ?? '').toLowerCase();
    if (n.endsWith('.pdf')) return 'bi-file-earmark-pdf';
    if (n.endsWith('.zip')) return 'bi-file-earmark-zip';
    if (n.endsWith('.docx') || n.endsWith('.doc')) return 'bi-file-earmark-word';
    if (n.endsWith('.tex')) return 'bi-file-earmark-code';
    return 'bi-file-earmark';
  }

  formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  }

  onDragEnter(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    this.dragDepth++;
    this.isDragActive = this.hasFiles(e);
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    this.isDragActive = this.hasFiles(e);
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.isDragActive = false;
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer?.files ?? []);
    this.isDragActive = false;
    this.dragDepth = 0;

    if (files.length) this.filesDropped.emit(files);
  }

  @HostListener('window:dragover', ['$event'])
  onWindowDragOver(e: DragEvent) {
    e.preventDefault();
  }

  @HostListener('window:drop', ['$event'])
  onWindowDrop(e: DragEvent) {
    e.preventDefault();
  }

  private hasFiles(e: DragEvent): boolean {
    const types = e.dataTransfer?.types;
    return !!types && Array.from(types).includes('Files');
  }
  onRefineQuery(): void {
    const trimmed = this.promptText.trim();
    if (!trimmed || this.isRefining) return;

    this.isRefining = true;
    this.chatApi.refineQuery(trimmed).subscribe({
      next: (res) => {
        this.isRefining = false;
        if (res.success && res.data) {
          this.promptText = res.data;
        } else {
          this.toast.show({ title: 'Refine failed', description: res.message || 'Could not refine your query.', variant: 'error' });
        }
      },
      error: () => {
        this.isRefining = false;
        this.toast.show({ title: 'Refine failed', description: 'Something went wrong. Please try again.', variant: 'error' });
      },
    });
  }

  onPaste(e: ClipboardEvent): void {
    const cd = e.clipboardData;
    if (!cd) return;

    const files: File[] = [];

    if (cd.items?.length) {
      for (const item of Array.from(cd.items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
    } else if (cd.files?.length) {

      files.push(...Array.from(cd.files));
    }

    if (!files.length) return;

    e.preventDefault();
    e.stopPropagation();

    const unique = files.filter(
      (f, i, arr) =>
        arr.findIndex(x => x.name === f.name && x.size === f.size && x.type === f.type) === i
    );

    this.filesPicked.emit(unique);
  }

}
