import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { ChatApiService } from '../../services/chat-api.service';
import { ToastService } from '../toast/toast.service';

type FeedbackState = 'idle' | 'open' | 'submitted';

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below expectations',
  3: 'Acceptable',
  4: 'Good',
  5: 'Excellent',
};

const COMMENT_MAX = 1000;

@Component({
  selector: 'app-message-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-feedback.component.html',
  styleUrls: ['./message-feedback.component.scss'],
})
export class MessageFeedbackComponent implements OnChanges {
  @Input() sessionId: string | null = null;
  @Input() messageId: string | null = null;
  @Input() rating: number | undefined;
  @Input() feedbackComment: string | undefined;

  @Output() feedbackChanged = new EventEmitter<{ rating?: number; feedbackComment?: string }>();

  private readonly chatApi = inject(ChatApiService);
  private readonly toast = inject(ToastService);

  readonly stars = [1, 2, 3, 4, 5];
  readonly commentMax = COMMENT_MAX;

  state: FeedbackState = 'idle';
  hoverStar = 0;
  draftRating = 0;
  draftComment = '';
  saving = false;

  get hasFeedback(): boolean {
    return !!this.rating && this.rating > 0;
  }

  get canSubmit(): boolean {
    return !this.saving && this.draftRating > 0 && this.draftRating <= 5;
  }

  get displayedStarValue(): number {
    if (this.state === 'open') {
      return this.hoverStar || this.draftRating;
    }
    return this.rating ?? 0;
  }

  get ratingLabel(): string {
    const value = this.state === 'open' ? this.hoverStar || this.draftRating : this.rating ?? 0;
    return RATING_LABELS[value] ?? '';
  }

  get isReady(): boolean {
    return !!this.sessionId && !!this.messageId;
  }

  
  get toneClass(): string {
    const value = this.rating ?? 0;
    if (value >= 4) return 'feedback--tone-success';
    if (value === 1) return 'feedback--tone-danger';
    if (value >= 2) return 'feedback--tone-warning';
    return 'feedback--tone-success';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rating'] || changes['feedbackComment']) {
      if (this.state !== 'open') {
        this.state = this.hasFeedback ? 'submitted' : 'idle';
        this.draftRating = this.rating ?? 0;
        this.draftComment = this.feedbackComment ?? '';
      }
    }
  }

  startRating(value: number): void {
    if (!this.isReady || this.saving) return;
    this.state = 'open';
    this.draftRating = value;
    this.draftComment = this.feedbackComment ?? '';
  }

  open(): void {
    if (!this.isReady || this.saving) return;
    this.state = 'open';
    this.draftRating = this.rating ?? 0;
    this.draftComment = this.feedbackComment ?? '';
  }

  cancel(): void {
    this.state = this.hasFeedback ? 'submitted' : 'idle';
    this.hoverStar = 0;
    this.draftRating = this.rating ?? 0;
    this.draftComment = this.feedbackComment ?? '';
  }

  setHover(value: number): void {
    if (this.state !== 'open') return;
    this.hoverStar = value;
  }

  clearHover(): void {
    this.hoverStar = 0;
  }

  setDraftRating(value: number): void {
    if (this.state !== 'open') {
      this.startRating(value);
      return;
    }
    this.draftRating = value;
  }

  async submit(): Promise<void> {
    if (!this.canSubmit || !this.sessionId || !this.messageId) return;

    this.saving = true;
    try {
      const resp = await firstValueFrom(
        this.chatApi.submitMessageFeedback(
          this.sessionId,
          this.messageId,
          this.draftRating,
          this.draftComment,
        ),
      );

      const data: any = (resp as any)?.data ?? resp;
      const newRating: number = Number(data?.rating ?? this.draftRating) || this.draftRating;
      const newComment: string =
        typeof data?.feedbackComment === 'string'
          ? data.feedbackComment
          : this.draftComment.trim();

      this.rating = newRating;
      this.feedbackComment = newComment || undefined;
      this.state = 'submitted';
      this.hoverStar = 0;

      this.feedbackChanged.emit({ rating: this.rating, feedbackComment: this.feedbackComment });
      this.toast.success('Thank you', 'Your feedback helps the assistant learn.');
    } catch (err) {
      console.error('Submit feedback failed', err);
      this.toast.error('Could not submit feedback', 'Please try again in a moment.');
    } finally {
      this.saving = false;
    }
  }

  async remove(): Promise<void> {
    if (this.saving || !this.sessionId || !this.messageId || !this.hasFeedback) return;

    this.saving = true;
    try {
      await firstValueFrom(
        this.chatApi.deleteMessageFeedback(this.sessionId, this.messageId),
      );

      this.rating = undefined;
      this.feedbackComment = undefined;
      this.draftRating = 0;
      this.draftComment = '';
      this.state = 'idle';
      this.feedbackChanged.emit({ rating: undefined, feedbackComment: undefined });
      this.toast.info('Feedback removed', 'Your rating was cleared.');
    } catch (err) {
      console.error('Delete feedback failed', err);
      this.toast.error('Could not remove feedback', 'Please try again in a moment.');
    } finally {
      this.saving = false;
    }
  }
}
