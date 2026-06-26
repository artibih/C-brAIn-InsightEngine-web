import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type FeedbackType = 'positive' | 'negative' | null;

@Component({
  selector: 'app-message-action-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-action-bar.component.html',
  styleUrls: ['./message-action-bar.component.scss']
})
export class MessageActionBarComponent {
  @Input() messageId!: string;
  @Input() content: string = '';
  @Input() feedback: FeedbackType = null;
  @Input() showRegenerate: boolean = true;
  @Input() showExport: boolean = true;

  @Output() copy = new EventEmitter<void>();
  @Output() feedbackGiven = new EventEmitter<FeedbackType>();
  @Output() regenerate = new EventEmitter<void>();
  @Output() exportPdf = new EventEmitter<void>();
  @Output() exportDocx = new EventEmitter<void>();

  showExportMenu = false;
  copied = false;

  async onCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.content);
      this.copied = true;
      this.copy.emit();

      
      setTimeout(() => {
        this.copied = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  onFeedback(type: FeedbackType): void {
    
    if (this.feedback === type) {
      this.feedbackGiven.emit(null);
    } else {
      this.feedbackGiven.emit(type);
    }
  }

  onRegenerate(): void {
    this.regenerate.emit();
  }

  toggleExportMenu(): void {
    this.showExportMenu = !this.showExportMenu;
  }

  onExportPdf(): void {
    this.exportPdf.emit();
    this.showExportMenu = false;
  }

  onExportDocx(): void {
    this.exportDocx.emit();
    this.showExportMenu = false;
  }
}
