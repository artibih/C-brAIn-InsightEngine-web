import { Component, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonComponent } from '../../shared/button/button.component';
import { LikertScaleComponent } from '../../shared/likert-scale/likert-scale.component';
import { FeedbackService } from '../../services/feedback.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/toast/toast.service';
import { FeedbackPayload, FeedbackItem } from '../../models/feedback.model';

@Component({
  selector: 'app-feedback-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, LikertScaleComponent],
  templateUrl: './feedback-page.component.html',
  styleUrls: ['./feedback-page.component.scss'],
})
export class FeedbackPageComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private auth = inject(AuthService);
  private feedbackService = inject(FeedbackService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  activeTab: 'new' | 'history' = 'new';
  historyItems: FeedbackItem[] = [];
  historyLoading = false;
  historyTotalCount = 0;
  historyPage = 1;
  readonly historyPageSize = 10;
  expandedItemId: string | null = null;

  currentStep = 1;
  readonly totalSteps = 3;
  submitted = false;
  submitting = false;
  showStepErrors = false;

  private readonly startTime = new Date().toISOString();

  readonly steps = [
    { number: 1, label: 'System Outputs' },
    { number: 2, label: 'User Interface' },
    { number: 3, label: 'Your Details' },
  ];

  readonly familiarityOptions = [
    { value: 'not_familiar', label: 'Not familiar at all' },
    { value: 'somewhat', label: 'Somewhat familiar' },
    { value: 'familiar', label: 'Familiar' },
    { value: 'very_familiar', label: 'Very familiar' },
    { value: 'expert', label: 'Expert' },
  ];

  readonly TEXT_MAX_LENGTH = 500;

  readonly form = this.fb.group({
    outputsUnderstandable: [null, Validators.required],
    statementsCorrect: [null, Validators.required],
    logicSound: [null, Validators.required],
    sourcesIdentifiable: [null, Validators.required],
    incorrectClaims: ['', Validators.maxLength(500)],
    goodReasoningExample: ['', Validators.maxLength(500)],
    poorReasoningExample: ['', Validators.maxLength(500)],
    additionalInfoDesired: ['', Validators.maxLength(500)],
    additionalTestingData: ['', Validators.maxLength(500)],

    toolFamiliarity: [null, Validators.required],
    toolStraightforward: [null, Validators.required],
    experienceStandout: ['', Validators.maxLength(500)],
    wouldUseAgain: [null, Validators.required],

    email: ['', [Validators.required, Validators.email]],
    name: ['', Validators.required],
    affiliation: [''],
    toolComparison: ['', Validators.maxLength(500)],
    additionalFeatures: ['', Validators.maxLength(500)],
  });

  private readonly step1Controls = [
    'outputsUnderstandable', 'statementsCorrect', 'logicSound', 'sourcesIdentifiable',
    'incorrectClaims', 'goodReasoningExample', 'poorReasoningExample', 'additionalInfoDesired', 'additionalTestingData',
  ] as const;

  private readonly step2Controls = [
    'toolFamiliarity', 'toolStraightforward', 'wouldUseAgain', 'experienceStandout',
  ] as const;

  private readonly step3Controls = ['email', 'name', 'toolComparison', 'additionalFeatures'] as const;

  constructor() {
    this.auth.userEmail$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(email => {
        if (email) this.form.patchValue({ email });
      });

    this.auth.userName$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(name => {
        if (name) this.form.patchValue({ name });
      });
  }

  get currentStepValid(): boolean {
    const controls = this.getStepControls(this.currentStep);
    return controls.every(key => {
      const ctrl = this.form.get(key);
      return ctrl ? ctrl.valid : true;
    });
  }

  nextStep(): void {
    if (!this.currentStepValid) {
      this.showStepErrors = true;
      this.markStepTouched(this.currentStep);
      return;
    }
    this.showStepErrors = false;
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevStep(): void {
    this.showStepErrors = false;
    if (this.currentStep > 1) {
      this.currentStep--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  onSubmit(): void {
    if (!this.currentStepValid) {
      this.showStepErrors = true;
      this.markStepTouched(this.currentStep);
      return;
    }

    if (this.form.invalid) {
      this.toast.error('Please fix validation errors before submitting.');
      return;
    }

    this.submitting = true;
    const values = this.form.getRawValue();

    const payload: FeedbackPayload = {
      ...values,
      id: crypto.randomUUID(),
      startTime: this.startTime,
      completionTime: new Date().toISOString(),
    } as FeedbackPayload;

    this.feedbackService.submitFeedback(payload).subscribe({
      next: () => {
        this.submitted = true;
        this.submitting = false;
        this.toast.success('Your feedback has been submitted successfully.', 'Thank you!');
      },
      error: (err) => {
        this.submitting = false;
        const status = err?.status;
        if (status === 413 || status === 400) {
          this.toast.error('Your response is too long. Please shorten the text fields and try again.');
        } else if (status === 401 || status === 403) {
          this.toast.error('Session expired. Please log in again and resubmit.');
        } else {
          this.toast.error('Failed to submit feedback. Please check your connection and try again.');
        }
      },
    });
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  switchTab(tab: 'new' | 'history'): void {
    this.activeTab = tab;
    if (tab === 'history') {
      this.loadHistory();
    }
  }

  loadHistory(): void {
    this.historyLoading = true;
    this.feedbackService.getMyFeedback(this.historyPage, this.historyPageSize)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.historyItems = res.data.items;
          this.historyTotalCount = res.data.totalCount;
          this.historyLoading = false;
        },
        error: () => {
          this.historyLoading = false;
          this.toast.error('Failed to load feedback history.');
        },
      });
  }

  loadHistoryPage(page: number): void {
    this.historyPage = page;
    this.loadHistory();
  }

  get historyTotalPages(): number {
    return Math.ceil(this.historyTotalCount / this.historyPageSize);
  }

  toggleExpand(id: string): void {
    this.expandedItemId = this.expandedItemId === id ? null : id;
  }

  getLikertLabel(value: number | null): string {
    if (!value) return '-';
    const labels: Record<number, string> = {
      1: 'Strongly Disagree',
      2: 'Disagree',
      3: 'Neutral',
      4: 'Agree',
      5: 'Strongly Agree',
    };
    return labels[value] ?? `${value}`;
  }

  getFamiliarityLabel(value: string | null): string {
    if (!value) return '-';
    const labels: Record<string, string> = {
      not_familiar: 'Not familiar at all',
      somewhat: 'Somewhat familiar',
      familiar: 'Familiar',
      very_familiar: 'Very familiar',
      expert: 'Expert',
    };
    return labels[value] ?? value;
  }

  getCharCount(controlName: string): number {
    return (this.form.get(controlName)?.value as string)?.length ?? 0;
  }

  isOverLimit(controlName: string): boolean {
    const ctrl = this.form.get(controlName);
    return !!ctrl?.hasError('maxlength');
  }

  private getStepControls(step: number): readonly string[] {
    switch (step) {
      case 1: return this.step1Controls;
      case 2: return this.step2Controls;
      case 3: return this.step3Controls;
      default: return [];
    }
  }

  private markStepTouched(step: number): void {
    const controls = this.getStepControls(step);
    controls.forEach(key => this.form.get(key)?.markAsTouched());
  }
}
