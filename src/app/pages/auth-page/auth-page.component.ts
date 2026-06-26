import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/toast/toast.service';
import { OrganizationService, OrganizationOption } from '../../services/organization.service';
import { ThemeService } from '../../services/theme.service';
import { filter } from 'rxjs/operators';
import { EulaDialogComponent } from '../../shared/eula/eula-dialog.component';
import { EulaAcknowledgments, EULA_VERSION } from '../../constants/eula.constants';

@Component({
    selector: 'app-auth-page',
    imports: [ReactiveFormsModule, EulaDialogComponent],
    templateUrl: './auth-page.component.html',
    styleUrls: ['./auth-page.component.scss']
})
export class AuthPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private orgService = inject(OrganizationService);
  private destroyRef = inject(DestroyRef);
  readonly theme = inject(ThemeService);

  form: FormGroup = this.fb.group({
    firstName: [''],
    lastName: [''],
    organizationId: [null as number | null],
    newOrganizationName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    justification: [''],
  });

  organizations: OrganizationOption[] = [];
  isCreatingNew = false;

  passwordErrors: string[] = [];

  showEula = false;
  eulaAccepted = false;
  eulaAttempted = false;

  loading = false;

  get isRegister(): boolean {
    return this.router.url.startsWith('/auth/register');
  }

  get firstName() { return this.form.get('firstName'); }
  get lastName() { return this.form.get('lastName'); }
  get organizationId() { return this.form.get('organizationId'); }
  get newOrganizationName() { return this.form.get('newOrganizationName'); }
  get email() { return this.form.get('email'); }
  get password() { return this.form.get('password'); }
  get justification() { return this.form.get('justification'); }

  ngOnInit(): void {
    this.updateValidators();
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.updateValidators();
      if (this.isRegister) {
        this.loadOrganizations();
      }
    });

    if (this.isRegister) {
      this.loadOrganizations();
    }
  }

  private loadOrganizations(): void {
    this.orgService.getOrganizations().subscribe({
      next: (orgs) => this.organizations = orgs,
      error: () => this.organizations = []
    });
  }

  toggleCreateNew(): void {
    this.isCreatingNew = !this.isCreatingNew;
    if (this.isCreatingNew) {
      this.organizationId?.reset();
      this.organizationId?.clearValidators();
      this.newOrganizationName?.setValidators([Validators.required]);
    } else {
      this.newOrganizationName?.reset();
      this.newOrganizationName?.clearValidators();
      this.organizationId?.setValidators([Validators.required]);
    }
    this.organizationId?.updateValueAndValidity();
    this.newOrganizationName?.updateValueAndValidity();
  }

  private updateValidators(): void {
    if (this.isRegister) {
      this.firstName?.setValidators([Validators.required]);
      this.lastName?.setValidators([Validators.required]);
      this.justification?.setValidators([Validators.required]);
      if (this.isCreatingNew) {
        this.newOrganizationName?.setValidators([Validators.required]);
        this.organizationId?.clearValidators();
      } else {
        this.organizationId?.setValidators([Validators.required]);
        this.newOrganizationName?.clearValidators();
      }
    } else {
      this.firstName?.clearValidators();
      this.lastName?.clearValidators();
      this.organizationId?.clearValidators();
      this.newOrganizationName?.clearValidators();
      this.justification?.clearValidators();
    }
    this.firstName?.updateValueAndValidity();
    this.lastName?.updateValueAndValidity();
    this.organizationId?.updateValueAndValidity();
    this.newOrganizationName?.updateValueAndValidity();
    this.justification?.updateValueAndValidity();
  }

  validatePassword(): void {
    const pwd = this.password?.value ?? '';
    const errors: string[] = [];

    if (pwd.length < 8) {
      errors.push('At least 8 characters');
    }
    if (!/[A-Z]/.test(pwd)) {
      errors.push('At least one uppercase letter');
    }
    if (!/[a-z]/.test(pwd)) {
      errors.push('At least one lowercase letter');
    }
    if (!/[0-9]/.test(pwd)) {
      errors.push('At least one digit');
    }
    if (!/[^a-zA-Z0-9]/.test(pwd)) {
      errors.push('At least one special character');
    }

    this.passwordErrors = errors;
  }

  get isPasswordValid(): boolean {
    return this.passwordErrors.length === 0 && (this.password?.value?.length ?? 0) > 0;
  }

  get hasMinLength(): boolean {
    return (this.password?.value?.length ?? 0) >= 8;
  }

  get hasUppercase(): boolean {
    return /[A-Z]/.test(this.password?.value ?? '');
  }

  get hasLowercase(): boolean {
    return /[a-z]/.test(this.password?.value ?? '');
  }

  get hasDigit(): boolean {
    return /[0-9]/.test(this.password?.value ?? '');
  }

  get hasSpecialChar(): boolean {
    return /[^a-zA-Z0-9]/.test(this.password?.value ?? '');
  }

  onBack(): void {
    this.router.navigate(['/auth']);
  }

  goRegister(): void {
    this.router.navigate(['/auth/register']);
  }

  goLogin(): void {
    this.router.navigate(['/auth/login']);
  }

  openEula(): void {
    this.showEula = true;
  }

  onEulaAccept(_acknowledgments: EulaAcknowledgments): void {
    this.eulaAccepted = true;
    this.eulaAttempted = false;
    this.showEula = false;
  }

  onEulaDecline(): void {
    this.showEula = false;
    this.eulaAttempted = false;
  }

  onSubmit(): void {
    if (this.loading) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isRegister) {
      this.validatePassword();
      if (!this.isPasswordValid) {
        this.form.markAllAsTouched();
        return;
      }

      if (!this.eulaAccepted) {
        this.eulaAttempted = true;
        this.showEula = true;
        return;
      }
    }

    const email = String(this.form.value.email ?? '').trim();
    const password = String(this.form.value.password ?? '');

    this.loading = true;

    if (!this.isRegister) {

      this.auth.login(email, password, true).subscribe({
        next: () => {
          this.loading = false;
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.loading = false;

          if (err?.status === 403) {
            const msg = this.extractErrorMessage(err, 'Your account is pending approval.');
            this.toast.info('Access pending', msg);
            return;
          }

          const msg = this.extractErrorMessage(
            err,
            'Invalid email or password.'
          );

          this.toast.error('Login failed', msg);
        },

      });

      return;
    }

    const payload: any = {
      email,
      password,
      firstName: String(this.form.value.firstName ?? '').trim(),
      lastName: String(this.form.value.lastName ?? '').trim(),
      justification: String(this.form.value.justification ?? '').trim(),
      roleId: '2',
      acceptedEulaVersion: EULA_VERSION,
    };

    if (this.isCreatingNew) {
      payload.organizationName = String(this.form.value.newOrganizationName ?? '').trim();
    } else {
      payload.organizationId = this.form.value.organizationId;
    }

    this.auth.register(payload).subscribe({
      next: () => {
        this.loading = false;
        this.toast.success(
          'Request submitted!',
          'Your access request has been submitted. You will be notified once approved.'
        );
        this.router.navigate(['/auth/login']);
      },
      error: (err) => {
        this.loading = false;

        const msg = this.extractErrorMessage(
          err,
          'Registration failed'
        );

        this.toast.error('Registration failed', msg);
      },

    });
  }
  private extractErrorMessage(err: any, fallback: string): string {
    if (!err) return fallback;

    if (typeof err === 'string') return err;

    const e = err.error ?? err;

    const baseMsg =
      (typeof e === 'string' ? e : (e?.message || e?.Message || e?.title)) ||
      err?.message ||
      fallback;

    const validation = e?.errors;
    if (validation && typeof validation === 'object') {
      const lines: string[] = [];

      for (const key of Object.keys(validation)) {
        const val = validation[key];
        if (Array.isArray(val)) {
          lines.push(...val.map(x => String(x)));

        } else if (val) {
          lines.push(String(val));
        }
      }

      if (lines.length) {
        return `${baseMsg}\n${lines.join('\n')}`.trim();
      }
    }

    return baseMsg;
  }



}
