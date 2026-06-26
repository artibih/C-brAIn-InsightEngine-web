import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, Input, signal } from '@angular/core';

import { LlmSelectionService } from '../../core/ai/llm-selection.service';
import { DEFAULT_LLM_MODEL, LlmModel } from '../../constants/llm-models.constants';





@Component({
  selector: 'tp-llm-selector',
  imports: [CommonModule],
  templateUrl: './llm-selector.component.html',
  styleUrls: ['./llm-selector.component.scss'],
})
export class LlmSelectorComponent {
  private readonly llm = inject(LlmSelectionService);

  
  @Input() disabled = false;

  




  @Input() locked = false;

  readonly models = this.llm.models;
  readonly selected = this.llm.selected;
  readonly isOpen = signal(false);

  
  get displayModel(): LlmModel {
    return this.locked ? DEFAULT_LLM_MODEL : this.selected();
  }

  toggle(): void {
    if (this.disabled || this.locked) return;
    this.isOpen.update((open) => !open);
  }

  close(): void {
    this.isOpen.set(false);
  }

  choose(model: LlmModel): void {
    this.llm.select(model);
    this.close();
  }

  isActive(model: LlmModel): boolean {
    return model.modelKey === this.selected().modelKey;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
