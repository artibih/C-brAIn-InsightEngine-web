import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
@Component({
    selector: 'tp-auto-save-indicator',
    imports: [],
    templateUrl: './auto-save-indicator.component.html',
    styleUrls: ['./auto-save-indicator.component.scss']
})
export class AutoSaveIndicatorComponent implements OnChanges {

  @Input() hasRestoredContent = false;
  @Output() clearRestored = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();

  showIndicator = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hasRestoredContent'] && this.hasRestoredContent) {
      this.showIndicator = true;
    }
  }

  handleDismiss(): void {
    this.showIndicator = false;
    this.dismissed.emit();
  }

  handleClearRestored(): void {
    this.clearRestored.emit();
    this.showIndicator = false;
  }
}
