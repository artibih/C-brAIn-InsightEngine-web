import {
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ThemeService } from '../../services/theme.service';
import {
  EULA_ACKNOWLEDGMENTS,
  EULA_CONTENT,
  EULA_DOC_SUBTITLE,
  EULA_DOC_TITLE,
  EulaAckKey,
  EulaAcknowledgments,
} from '../../constants/eula.constants';






@Component({
  selector: 'app-eula-dialog',
  standalone: true,
  imports: [],
  templateUrl: './eula-dialog.component.html',
  styleUrls: ['./eula-dialog.component.scss'],
})
export class EulaDialogComponent {
  
  @Input() mode: 'gate' | 'review' = 'gate';
  
  @Input() loading = false;

  @Output() readonly accept = new EventEmitter<EulaAcknowledgments>();
  @Output() readonly decline = new EventEmitter<void>();

  readonly theme = inject(ThemeService);

  readonly docTitle = EULA_DOC_TITLE;
  readonly docSubtitle = EULA_DOC_SUBTITLE;
  readonly content = EULA_CONTENT;
  readonly acknowledgments = EULA_ACKNOWLEDGMENTS;

  private readonly checks = signal<EulaAcknowledgments>({
    agreement: false,
    peerReview: false,
    dataUse: false,
    liability: false,
  });

  readonly allChecked = computed(() =>
    this.acknowledgments.every((a) => this.checks()[a.key]),
  );

  isChecked(key: EulaAckKey): boolean {
    return this.checks()[key];
  }

  toggle(key: EulaAckKey): void {
    if (this.loading) return;
    this.checks.update((c) => ({ ...c, [key]: !c[key] }));
  }

  onAccept(): void {
    if (this.loading || !this.allChecked()) return;
    this.accept.emit({ ...this.checks() });
  }

  onDecline(): void {
    if (this.loading) return;
    this.decline.emit();
  }
}
