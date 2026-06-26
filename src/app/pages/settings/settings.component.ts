import { Component, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService } from '../../shared/toast/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../services/account.service';

type BackendErrorItem = { code?: string; description?: string; message?: string };

@Component({
    selector: 'app-settings',
    standalone: true,
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
    imports: [CommonModule, FormsModule]
})
export class SettingsComponent {
  private router = inject(Router);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  private auth = inject(AuthService);
  private accounts = inject(AccountService);

  email: string = '';

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';

  showCurrent = false;
  showNew = false;
  showConfirm = false;

  savingPassword = false;
  touched = false;

  errors: {
    currentPassword?: string;
    newPassword?: string;
    confirmNewPassword?: string;
  } = {};

  isPasswordFormValid = false;

  constructor() {
    this.auth.userEmail$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => (this.email = e ?? ''));
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  validatePasswordForm(): void {
    const errs: any = {};

    const cur = (this.currentPassword ?? '').trim();
    const np = (this.newPassword ?? '').trim();
    const cp = (this.confirmNewPassword ?? '').trim();

    if (!cur) {
      errs.currentPassword = 'Current password is required.';
    }

    if (!np) {
      errs.newPassword = 'New password is required.';
    } else if (np.length < 8) {
      errs.newPassword = 'New password must be at least 8 characters.';
    } else if (!/[^a-zA-Z0-9]/.test(np)) {
      errs.newPassword = 'New password must contain at least one special character.';
    } else if (cur && np === cur) {
      errs.newPassword = 'New password must be different from the current password.';
    }

    if (!cp) {
      errs.confirmNewPassword = 'Please confirm your new password.';
    } else if (np && cp !== np) {
      errs.confirmNewPassword = 'New passwords do not match.';
    }

    this.errors = errs;
    this.isPasswordFormValid = Object.keys(errs).length === 0;
  }

  updatePassword(): void {
    this.touched = true;
    this.validatePasswordForm();
    if (!this.isPasswordFormValid) return;

    if (!this.email) {
      this.toast.error('User email is missing. Please re-login.');
      return;
    }

    const currentPassword = (this.currentPassword ?? '').trim();
    const newPassword = (this.newPassword ?? '').trim();

    this.savingPassword = true;

    this.accounts.changePassword({
      email: this.email,
      currentPassword,
      newPassword
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (text: string) => {
          this.savingPassword = false;
          this.toastBackend(text, 'success');

          this.currentPassword = '';
          this.newPassword = '';
          this.confirmNewPassword = '';
          this.touched = false;
          this.errors = {};
          this.isPasswordFormValid = false;
        },
        error: (err) => {
          this.savingPassword = false;
          const body = err?.error ?? err?.message ?? err;
          this.applyBackendFieldErrors(body);
          this.toastBackend(body, 'error');
        }
      });
  }


  private applyBackendFieldErrors(raw: unknown): void {
    const items = this.extractBackendErrorItems(raw);


    for (const it of items) {
      const code = (it.code ?? '').toLowerCase();
      const desc = (it.description ?? it.message ?? '').trim();

      if (!code) continue;

      if (code.includes('invalidcurrentpassword') || code.includes('currentpassword')) {
        this.errors = { ...this.errors, currentPassword: 'Current password is incorrect.' };
      }

      if (
        code.includes('passwordtooshort') ||
        code.includes('passwordrequires') ||
        code.includes('passwordrequiresnonalphanumeric') ||
        code.includes('passwordrequiresdigit') ||
        code.includes('passwordrequiresuppercase') ||
        code.includes('passwordrequireslowercase')
      ) {
        this.errors = { ...this.errors, newPassword: desc || 'New password does not meet requirements.' };
      }
    }

    if (!items.length) {
      const msgs = this.extractBackendMessages(raw);
      const joined = msgs.join(' ').toLowerCase();
      if (joined.includes('current password')) {
        this.errors = { ...this.errors, currentPassword: 'Current password is incorrect.' };
      }
    }
  }

  private extractBackendErrorItems(raw: unknown): BackendErrorItem[] {
    if (typeof raw === 'string') {
      const s = raw.trim();
      if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
        try { return this.extractBackendErrorItems(JSON.parse(s)); } catch { return []; }
      }
      return [];
    }

    if (Array.isArray(raw)) {
      return raw.filter(x => x && typeof x === 'object') as BackendErrorItem[];
    }

    if (raw && typeof raw === 'object') {
      const o: any = raw;
      if (Array.isArray(o.errors)) {
        return o.errors.filter((x: any) => x && typeof x === 'object') as BackendErrorItem[];
      }
    }

    return [];
  }

  private extractBackendMessages(raw: unknown): string[] {
    if (typeof raw === 'string') {
      const s = raw.trim();
      if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
        try { return this.extractBackendMessages(JSON.parse(s)); } catch { return [s]; }
      }
      return s ? [s] : [];
    }

    if (Array.isArray(raw)) {
      const msgs = raw
        .map((x: any) => x?.description ?? x?.message ?? x?.error ?? null)
        .filter(Boolean)
        .map(String);
      return msgs.length ? msgs : ['Request failed.'];
    }

    if (raw && typeof raw === 'object') {
      const o: any = raw;
      const msgs: string[] = [];

      if (o.message) msgs.push(String(o.message));

      if (Array.isArray(o.errors)) {
        msgs.push(
          ...o.errors
            .map((e: any) => e?.description ?? e?.message ?? null)
            .filter(Boolean)
            .map(String)
        );
      }

      if (!msgs.length && o.error) msgs.push(String(o.error));
      return msgs.length ? msgs : ['Request failed.'];
    }

    return [];
  }

  private toastBackend(raw: unknown, type: 'success' | 'error'): void {
    const msgs = this.extractBackendMessages(raw);
    const text = msgs.filter(Boolean).join('\n') || (type === 'success'
      ? 'Password has been changed successfully.'
      : 'Failed to update password. Please try again.');

    if (type === 'success') this.toast.info(text);
    else this.toast.error(text);
  }
}
