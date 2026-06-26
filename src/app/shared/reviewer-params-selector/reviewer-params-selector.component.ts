import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, OnInit, inject, signal } from '@angular/core';

import { ReviewerParamsService } from '../../core/ai/reviewer-params.service';
import {
  REVIEWER_PARAM_GROUPS,
  ReviewerParamKey,
  ReviewerParamOption,
} from '../../constants/reviewer-params.constants';







@Component({
  selector: 'tp-reviewer-params-selector',
  imports: [CommonModule],
  templateUrl: './reviewer-params-selector.component.html',
  styleUrls: ['./reviewer-params-selector.component.scss'],
})
export class ReviewerParamsSelectorComponent implements OnInit {
  private readonly reviewerParams = inject(ReviewerParamsService);

  
  @Input() disabled = false;

  readonly groups = REVIEWER_PARAM_GROUPS;
  readonly status = this.reviewerParams.status;
  readonly isOpen = signal(false);

  ngOnInit(): void {
    this.reviewerParams.ensureLoaded();
  }

  optionsFor(key: ReviewerParamKey): readonly ReviewerParamOption[] {
    return this.reviewerParams.optionsFor(key);
  }

  isActive(key: ReviewerParamKey, option: ReviewerParamOption): boolean {
    return this.reviewerParams.selectedValue(key) === option.value;
  }

  toggle(): void {
    if (this.disabled) return;
    this.isOpen.update((open) => !open);
  }

  close(): void {
    this.isOpen.set(false);
  }

  choose(key: ReviewerParamKey, option: ReviewerParamOption): void {
    this.reviewerParams.select(key, option.value);
  }

  retry(): void {
    this.reviewerParams.retry();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
