import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LikertValue } from '../../models/feedback.model';

interface LikertOption {
  value: number;
  label: string;
  shortLabel: string;
}

@Component({
  selector: 'tp-likert-scale',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './likert-scale.component.html',
  styleUrls: ['./likert-scale.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => LikertScaleComponent),
      multi: true,
    },
  ],
})
export class LikertScaleComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() showError = false;

  readonly options: LikertOption[] = [
    { value: 1, label: 'Strongly Disagree', shortLabel: 'SD' },
    { value: 2, label: 'Disagree', shortLabel: 'D' },
    { value: 3, label: 'Neutral', shortLabel: 'N' },
    { value: 4, label: 'Agree', shortLabel: 'A' },
    { value: 5, label: 'Strongly Agree', shortLabel: 'SA' },
  ];

  selectedValue: LikertValue = null;
  disabled = false;

  private onChange: (value: LikertValue) => void = () => {};
  private onTouched: () => void = () => {};

  select(value: number): void {
    if (this.disabled) return;
    this.selectedValue = value as LikertValue;
    this.onChange(this.selectedValue);
    this.onTouched();
  }

  writeValue(value: LikertValue): void {
    this.selectedValue = value;
  }

  registerOnChange(fn: (value: LikertValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
