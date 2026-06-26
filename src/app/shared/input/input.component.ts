import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

@Component({
    selector: 'tp-input',
    imports: [FormsModule, DecimalPipe],
    templateUrl: './input.component.html',
    styleUrls: ['./input.component.scss']
})
export class InputComponent implements AfterViewInit, OnChanges {
  @ViewChild('ta') ta!: ElementRef<HTMLTextAreaElement>;

  @Input() placeholder = 'Message AI Workspace...';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() required = true;
  @Input() errorText = 'Message cannot be empty.';
  @Input() maxLength = 50000;
  @Output() send = new EventEmitter<string>();
  @Output() inputChange = new EventEmitter<string>();

  @Input() value = '';
  @Input() maxRows = 10;

  isFocused = false;
  attemptedSend = false;

  get showEmptyError(): boolean {
    return this.required && this.attemptedSend && !this.value.trim();
  }

  get isNearLimit(): boolean {
    return this.value.length > this.maxLength * 0.9;
  }

  get isOverLimit(): boolean {
    return this.value.length > this.maxLength;
  }

  ngAfterViewInit(): void {
    this.resize();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('value' in changes) {
      requestAnimationFrame(() => this.resize());
    }
  }


  onFocus() { this.isFocused = true; }

  onBlur() {
    if (!this.value.trim()) this.isFocused = false;
  }

  onValueChange(v: string) {
    this.value = v;
    this.inputChange.emit(v);
    this.resize();
    if (this.attemptedSend && v.trim()) this.attemptedSend = false;
  }

  private resize(): void {
    if (!this.ta) return;
    const el = this.ta.nativeElement;

    el.style.height = 'auto';

    const computed = getComputedStyle(el);
    const lineHeight = parseFloat(computed.lineHeight || '22') || 22;
    const jsMax = this.maxRows * lineHeight;
    const cssMax = parseFloat(computed.maxHeight) || Infinity;
    const maxHeight = Math.min(jsMax, cssMax);

    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;

    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.onSend();
    }
  }

  onSend() {
    const trimmed = this.value.trim();
    if (!trimmed) {
      if (this.required) this.attemptedSend = true;
      return;
    }
    if (this.disabled || this.loading || this.isOverLimit) return;

    this.send.emit(trimmed);

    this.value = '';
    this.inputChange.emit('');
    this.resize();
    this.isFocused = false;
    this.attemptedSend = false;
  }
}
