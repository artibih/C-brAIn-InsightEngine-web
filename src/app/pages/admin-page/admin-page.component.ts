import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, map, switchMap, debounceTime, distinctUntilChanged, catchError } from 'rxjs/operators';

import { ToastService } from '../../shared/toast/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../services/account.service';
import { OrganizationService, OrganizationOption } from '../../services/organization.service';
import { FeedbackService } from '../../services/feedback.service';
import { AppUserDto } from '../../models/user.model';
import { FeedbackItem } from '../../models/feedback.model';
import { PagedResult } from '../../models/paged-result.model';
import { Subject, of, merge } from 'rxjs';
import { UserRole, ROLE_ID_MAP, ROLE_BACKEND_MAP } from '../../constants/roles.constants';

interface AccessRequest {
  id: number;
  email: string;
  name: string;
  organization: string;
  requestedRole: string;
  justification: string;
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected';
}

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  pendingRequests: number;
}

@Component({
    selector: 'app-admin-page',
    imports: [CommonModule, FormsModule],
    templateUrl: './admin-page.component.html',
    styleUrls: ['./admin-page.component.scss']
})
export class AdminPageComponent implements OnInit {
  private router = inject(Router);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private accounts = inject(AccountService);
  private orgService = inject(OrganizationService);
  private feedbackService = inject(FeedbackService);
  private destroyRef = inject(DestroyRef);
  private refresh$ = new Subject<void>();

  organizations: OrganizationOption[] = [];

  activeTab: 'overview' | 'users' | 'requests' | 'feedback' = 'overview';

  feedbackItems: FeedbackItem[] = [];
  loadingFeedback = false;
  feedbackPage = 1;
  feedbackPageSize = 20;
  feedbackTotalCount = 0;
  feedbackTotalPages = 0;
  expandedFeedbackId: string | null = null;

  email = '';
  password = '';
  newUserFirstName = '';
  newUserLastName = '';
  newUserOrganization = '';
  newUserRole: UserRole = 'C-Brain User';
  availableRoles: UserRole[] = ['Admin', 'C-Brain User', 'External User'];
  touched = false;
  errors: { email?: string; password?: string; firstName?: string; lastName?: string; organization?: string } = {};
  creating = false;
  isCreatingNewOrg = false;

  users: AppUserDto[] = [];
  loadingUsers = false;
  search = '';
  private search$ = new Subject<string>();

  currentPage = 1;
  pageSize = 20;
  totalCount = 0;
  totalPages = 0;

  confirmOpen = false;
  deleting = false;
  selectedToDelete: AppUserDto | null = null;

  myEmail: string | null = null;
  showPassword = false;

  accessRequests: AccessRequest[] = [];
  loadingRequests = false;
  processingRequest: number | null = null;

  loadingStats = false;
  stats: SystemStats = {
    totalUsers: 0,
    activeUsers: 0,
    pendingRequests: 0,
  };

  constructor() {
    this.auth.userEmail$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => (this.myEmail = e));

    merge(
      this.search$.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        map(q => { this.currentPage = 1; return q; })
      ),
      this.refresh$.pipe(map(() => this.search))
    )
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(q => {
          const query = (q ?? '').trim();
          this.loadingUsers = true;

          return this.accounts.getUsers(this.currentPage, this.pageSize, query).pipe(
            catchError(err => {
              if (err?.status === 404) {
                const empty: PagedResult<AppUserDto> = { items: [], pageNumber: 1, pageSize: this.pageSize, totalCount: 0, totalPages: 0, hasNext: false, hasPrevious: false };
                return of(empty);
              }
              const msg = err?.error?.message ?? err?.message ?? 'Failed to load users.';
              this.toast.error(msg);
              const empty: PagedResult<AppUserDto> = { items: [], pageNumber: 1, pageSize: this.pageSize, totalCount: 0, totalPages: 0, hasNext: false, hasPrevious: false };
              return of(empty);
            }),
            finalize(() => (this.loadingUsers = false))
          );
        })
      )
      .subscribe(result => {
        this.users = (result.items ?? [])
          .filter(u => u.emailConfirmed)
          .slice()
          .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
        this.totalCount = result.totalCount ?? 0;
        this.totalPages = result.totalPages ?? 1;
        this.currentPage = result.pageNumber || 1;
        this.loadingUsers = false;
      });
  }

  ngOnInit(): void {
    this.loadUsers();
    this.loadAccessRequests();
    this.loadStats();
    this.loadOrganizations();
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  setTab(tab: typeof this.activeTab): void {
    this.activeTab = tab;
    if (tab === 'feedback' && !this.feedbackItems.length) {
      this.loadFeedback();
    }
  }

  loadStats(): void {
    this.loadingStats = true;
    this.accounts.getAllUsers().pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError(() => of([] as AppUserDto[])),
      finalize(() => (this.loadingStats = false))
    ).subscribe(allUsers => {
      const users = allUsers ?? [];
      this.stats = {
        totalUsers: users.length,
        activeUsers: users.filter(u => u.emailConfirmed).length,
        pendingRequests: users.filter(u => !u.emailConfirmed).length,
      };
    });
  }

  loadOrganizations(): void {
    this.orgService.getOrganizations()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of([] as OrganizationOption[]))
      )
      .subscribe(orgs => (this.organizations = orgs));
  }

  loadUsers(): void {
    this.refresh$.next();
  }

  onSearchChange(): void {
    this.search$.next(this.search);
  }

  clearSearch(): void {
    this.search = '';
    this.search$.next('');
  }

  goToPage(page: number): void {
    if (!page || isNaN(page) || page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.refresh$.next();
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  toggleOrgMode(): void {
    this.isCreatingNewOrg = !this.isCreatingNewOrg;
    this.newUserOrganization = '';
    if (this.touched) this.validateCreateForm();
  }

  validateCreateForm(): void {
    const errs: any = {};
    const email = (this.email ?? '').trim();
    const pwd = (this.password ?? '').trim();
    const firstName = (this.newUserFirstName ?? '').trim();
    const lastName = (this.newUserLastName ?? '').trim();
    const organization = (this.newUserOrganization ?? '').trim();

    if (!firstName) errs.firstName = 'First name is required.';
    if (!lastName) errs.lastName = 'Last name is required.';
    if (!organization) errs.organization = 'Organization is required.';

    if (!email) errs.email = 'Email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Please enter a valid email.';

    if (!pwd) errs.password = 'Password is required.';
    else if (pwd.length < 8) errs.password = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(pwd)) errs.password = 'Password must have at least one uppercase letter.';
    else if (!/[0-9]/.test(pwd)) errs.password = 'Password must have at least one digit.';
    else if (!/[^a-zA-Z0-9]/.test(pwd)) errs.password = 'Password must contain at least one special character.';

    this.errors = errs;
  }

  createUser(): void {
    this.touched = true;
    this.validateCreateForm();
    if (Object.keys(this.errors).length) return;

    this.creating = true;

    const selectedOrg = this.organizations.find(o => o.name === this.newUserOrganization.trim());

    const payload = {
      email: this.email.trim(),
      password: this.password.trim(),
      firstName: this.newUserFirstName.trim(),
      lastName: this.newUserLastName.trim(),
      roleId: ROLE_ID_MAP[this.newUserRole] ?? '2',
      ...(selectedOrg
        ? { organizationId: selectedOrg.id }
        : { organizationName: this.newUserOrganization.trim() }),
    };

    this.auth.register(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.creating = false))
      )
      .subscribe({
        next: () => {
          this.toast.info('User created successfully.');
          this.email = '';
          this.password = '';
          this.newUserFirstName = '';
          this.newUserLastName = '';
          this.newUserOrganization = '';
          this.newUserRole = 'C-Brain User';
          this.touched = false;
          this.errors = {};
          this.loadUsers();
          this.loadAccessRequests();
          this.loadStats();
        },
        error: (err) => {
          const backendMsg =
            err?.error?.message ??
            err?.error?.errors?.[0]?.description ??
            err?.message ??
            'Failed to create user.';

          const low = String(backendMsg).toLowerCase();
          if (low.includes('exists') || low.includes('already')) {
            this.toast.error('User already exists.');
          } else {
            this.toast.error(backendMsg);
          }
        }
      });
  }

  requestDelete(u: AppUserDto): void {
    if (this.myEmail && (u.email ?? '').toLowerCase() === this.myEmail.toLowerCase()) {
      this.toast.error('You cannot delete your own account.');
      return;
    }

    this.selectedToDelete = u;
    this.confirmOpen = true;
  }

  cancelDelete(): void {
    this.confirmOpen = false;
    this.selectedToDelete = null;
  }

  confirmDelete(): void {
    if (!this.selectedToDelete) return;

    this.deleting = true;

    this.accounts.deleteUser(this.selectedToDelete.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.deleting = false))
      )
      .subscribe({
        next: () => {
          this.toast.info('User deleted successfully.');
          this.confirmOpen = false;
          this.selectedToDelete = null;
          this.loadUsers();
        },
        error: (err) => {
          const msg = err?.error?.message ?? err?.message ?? 'Failed to delete user.';
          this.toast.error(msg);
        }
      });
  }

  trackById(_: number, u: AppUserDto): number {
    return u.id;
  }

  roleLabel(u: AppUserDto): string {
    const roles = u?.roles ?? [];
    return roles.length ? roles.join(', ') : '—';
  }

  getRoleBadgeClass(u: AppUserDto): string {
    const role = (u?.roles?.[0] ?? '').toLowerCase();
    if (role.includes('admin')) return 'badge--error';
    if (role.includes('cbrain')) return 'badge--accent';
    if (role.includes('pending')) return 'badge--warning';
    return 'badge--primary';
  }

  loadAccessRequests(): void {
    this.loadingRequests = true;

    this.accounts.getAllUsers().pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError(err => {
        const msg = err?.error?.message ?? err?.message ?? 'Failed to load access requests.';
        this.toast.error(msg);
        return of([] as AppUserDto[]);
      }),
      finalize(() => (this.loadingRequests = false))
    ).subscribe(allUsers => {
      const pending = (allUsers ?? []).filter(u => !u.emailConfirmed);
      this.accessRequests = pending.map(u => ({
        id: u.id,
        email: u.email,
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
        organization: u.organizationName || '',
        requestedRole: u.roles?.[0] ?? 'User',
        justification: u.justification || '',
        createdAt: new Date(),
        status: 'pending' as const
      }));
      this.stats.pendingRequests = pending.length;
    });
  }

  approveRequest(request: AccessRequest, role: UserRole = 'C-Brain User'): void {
    this.processingRequest = request.id;

    const backendRole = this.toBackendRole(role);

    this.accounts.confirmEmail(request.id).pipe(
      switchMap(() => this.accounts.updateRoles(request.id, [backendRole])),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => (this.processingRequest = null))
    ).subscribe({
      next: () => {
        request.status = 'approved';
        this.toast.info(`Access approved for ${request.name} as ${role}`);
        this.loadAccessRequests();
        this.loadUsers();
        this.loadStats();
      },
      error: (err) => {
        const msg = err?.error?.message ?? err?.message ?? 'Failed to approve request';
        this.toast.error(msg);
      }
    });
  }

  rejectRequest(request: AccessRequest): void {
    this.processingRequest = request.id;

    this.accounts.deleteUser(request.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => (this.processingRequest = null))
    ).subscribe({
      next: () => {
        this.toast.info(`Access request rejected for ${request.name}`);
        this.loadAccessRequests();
        this.loadStats();
      },
      error: (err) => {
        const msg = err?.error?.message ?? err?.message ?? 'Failed to reject request';
        this.toast.error(msg);
      }
    });
  }

  getPendingRequests(): AccessRequest[] {
    return this.accessRequests.filter(r => r.status === 'pending');
  }

  private toBackendRole(role: UserRole): string {
    return ROLE_BACKEND_MAP[role] ?? 'User';
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  loadFeedback(): void {
    this.loadingFeedback = true;
    this.feedbackService.getAllFeedback(this.feedbackPage, this.feedbackPageSize).pipe(
      takeUntilDestroyed(this.destroyRef),
      catchError(err => {
        const msg = err?.error?.message ?? err?.message ?? 'Failed to load feedback.';
        this.toast.error(msg);
        return of({ success: false, data: { items: [], pageNumber: 1, pageSize: this.feedbackPageSize, totalCount: 0 } } as any);
      }),
      finalize(() => (this.loadingFeedback = false))
    ).subscribe(res => {
      const data = res?.data;
      this.feedbackItems = data?.items ?? [];
      this.feedbackTotalCount = data?.totalCount ?? 0;
      this.feedbackTotalPages = Math.ceil(this.feedbackTotalCount / this.feedbackPageSize);
      this.feedbackPage = data?.pageNumber ?? 1;
    });
  }

  feedbackGoToPage(page: number): void {
    if (!page || page < 1 || page > this.feedbackTotalPages || page === this.feedbackPage) return;
    this.feedbackPage = page;
    this.loadFeedback();
  }

  getFeedbackPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.feedbackPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.feedbackTotalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  toggleFeedbackExpand(id: string): void {
    this.expandedFeedbackId = this.expandedFeedbackId === id ? null : id;
  }

  likertLabel(value: number | null): string {
    if (value == null) return '-';
    const labels: Record<number, string> = { 1: 'Strongly Disagree', 2: 'Disagree', 3: 'Neutral', 4: 'Agree', 5: 'Strongly Agree' };
    return labels[value] ?? String(value);
  }

  familiarityLabel(value: string | null): string {
    if (!value) return '-';
    const labels: Record<string, string> = {
      not_familiar: 'Not Familiar',
      somewhat: 'Somewhat',
      familiar: 'Familiar',
      very_familiar: 'Very Familiar',
      expert: 'Expert'
    };
    return labels[value] ?? value;
  }

  formatDateTime(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  trackByFeedbackId(_: number, item: FeedbackItem): string {
    return item.id;
  }

}
