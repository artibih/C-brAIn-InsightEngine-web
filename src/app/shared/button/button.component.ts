import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

type BtnVariant = 'primary' | 'secondary' | 'danger';
type BtnSize = 'lg' | 'md' | 'sm' | 'xs';


@Component({
    standalone: true,
    selector: 'tp-button',
    imports: [CommonModule],
    templateUrl: './button.component.html',
    styleUrls: ['./button.component.scss']
})
export class ButtonComponent {
  @Input() variant: BtnVariant = 'primary';
  @Input() size: BtnSize = 'lg';
  @Input() fullWidth = false;
  @Input() disabled = false;
  @Input() type: 'button' | 'submit' | 'reset' = 'button';

  @Output() buttonClick = new EventEmitter<MouseEvent>();

  get classes() {
    return {
      ['tp-btn--' + this.variant]: true,
      ['tp-btn--' + this.size]: true,
      'tp-btn--block': this.fullWidth,
      'tp-btn--disabled': this.disabled,
    };
  }

  onClick(event: MouseEvent) {
    if (this.disabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.buttonClick.emit(event);
  }
}
