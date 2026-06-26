import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { HeaderComponent, MvpMode } from './layout/header/header.component';
import { ConversationTab } from './services/conversation-context.service';
import { MODE_DISPLAY_NAMES, QUICK_TO_MVP } from './constants/modes.constants';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import {
  RightPanelComponent,
  RightPanelTab,
} from './layout/right-panel/right-panel.component';
import { ReasoningStep } from './models/reasoning-step.model';

import { Citation, SavedConversation } from './models/conversation.models';
import { ConversationContextService } from './services/conversation-context.service';
import { AuthService } from './core/auth/auth.service';
import { combineLatest, distinctUntilChanged, filter, startWith } from 'rxjs';
import { ChatHubService } from './core/signalr/chat-hub.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastContainerComponent } from './shared/toast/toast-container.component';
import { map } from 'rxjs/operators';
import { ToastService } from './shared/toast/toast.service';
import { ChatApiService } from './services/chat-api.service';
import { ProjectService } from './services/project.service';
import { EulaService } from './services/eula.service';
import { EulaDialogComponent } from './shared/eula/eula-dialog.component';
import { EulaAcknowledgments } from './constants/eula.constants';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    SidebarComponent,
    ToastContainerComponent,
    EulaDialogComponent,

  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  userEmail: string | null = null;
  sidebarHidden = false;
  sidebarCollapsed = false;
  private destroyRef = inject(DestroyRef);
  conversations: SavedConversation[] = [];
  isAuthRoute = false;
  private sessionsLoaded = false;
  isLoadingConversations = false;
  hasMoreConversations = false;
  loadingMoreConversations = false;
  activeId: string | null = null;
  private chatApi = inject(ChatApiService);
  private projectService = inject(ProjectService);
  readonly eula = inject(EulaService);
  eulaSubmitting = false;
  private sidebarTimer: number | null = null;
  private sidebarRaf: number | null = null;

  isConversationRoute = true;

  activeMode: MvpMode = 'literature';

  activeConversationTab: ConversationTab = 'results';
  activeModeName = 'Data Synthesis and Literature Analyzer (MVP1)';

  rightPanelCollapsed = true;
  rightPanelActiveTab: RightPanelTab = 'citations';
  citations: Citation[] = [];
  reasoningSteps: ReasoningStep[] = [];
  referencesCount: number = 0;
  highlightedCitationId: string | null = null;
  selectedCitation: Citation | null = null;

  reviewerReady: { final: boolean; journal_editor: boolean; methodological: boolean; domain_expert: boolean; benchmark_evidence: boolean } = {
    final: false,
    journal_editor: false,
    methodological: false,
    domain_expert: false,
    benchmark_evidence: false,
  };
  reviewerStreaming = false;

  constructor(
    private router: Router,
    private conversationContext: ConversationContextService,
    private auth: AuthService,
    private chatHub: ChatHubService,
    private toast: ToastService,
  ) {
    this.auth.initialize();

    this.projectService.updateConversationProjectId =
      (convId, projId) => this.conversationContext.updateConversationProjectId(convId, projId);
    this.projectService.bulkClearProjectCallback =
      (projId) => this.conversationContext.clearProjectFromConversations(projId);

    this.auth.userEmail$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((email) => (this.userEmail = email));

    const url0 = this.router.url.split(/[?#]/)[0];
    const m0 = url0.match(/^\/conversation\/([^/]+)$/);
    this.activeId = m0 ? m0[1] : null;

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        const url = e.urlAfterRedirects.split(/[?#]/)[0];
        const m = url.match(/^\/conversation\/([^/]+)$/);
        const newId = m ? m[1] : null;

        if (newId !== this.activeId) {
          this.referencesCount = 0;
          this.conversationContext.setActiveTab('results');
        }

        this.activeId = newId;

        this.isConversationRoute =
          !url.startsWith('/admin') &&
          !url.startsWith('/settings') &&
          !url.startsWith('/feedback') &&
          !url.startsWith('/knowledge-graph');
      });

    const isAuthRoute$ = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.startsWith('/auth')),
      startWith(this.router.url.startsWith('/auth')),
      distinctUntilChanged(),
    );

    isAuthRoute$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => (this.isAuthRoute = v));

    combineLatest([
      this.auth.isAuthenticated$.pipe(distinctUntilChanged()),
      isAuthRoute$,
    ])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(([isAuth, isAuthRoute]) => isAuth && !isAuthRoute),
      )
      .subscribe(async () => {
        if (this.sessionsLoaded) return;
        this.sessionsLoaded = true;
        this.isLoadingConversations = true;

        try {

          await this.chatHub.connect();
          await this.conversationContext.initAfterLogin();
        } catch {
          this.sessionsLoaded = false;
        } finally {
          this.isLoadingConversations = false;
        }
      });

    this.auth.isAuthenticated$
      .pipe(takeUntilDestroyed(this.destroyRef), distinctUntilChanged())
      .subscribe((isAuth) => {
        if (!isAuth) {
          this.sessionsLoaded = false;
          this.chatHub.disconnect();
          this.conversationContext.resetAll();
        }
      });

    this.conversationContext.sidebarConversations$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        this.conversations = list;
      });

    this.conversationContext.hasMoreSessions$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => (this.hasMoreConversations = v));

    this.conversationContext.loadingMoreSessions$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => (this.loadingMoreConversations = v));

    this.conversationContext.activeMode$
      .pipe(
        distinctUntilChanged((a, b) => {
          if (a.kind === 'quick' && b.kind === 'quick') return a.mode === b.mode;
          if (a.kind === 'specialized' && b.kind === 'specialized') return a.id === b.id;
          return false;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((mode) => {
        if (mode.kind === 'quick') {
          this.activeModeName = MODE_DISPLAY_NAMES[mode.mode] || 'AI Assistant';
          this.activeMode = QUICK_TO_MVP[mode.mode] || 'literature';
        } else if (mode.kind === 'specialized') {
          this.activeModeName = mode.name || 'Specialized Mode';
          this.activeMode = 'analyzer';
        }

        this.referencesCount = 0;
        this.reasoningSteps = [];
        this.citations = [];
        this.reviewerReady = { final: false, journal_editor: false, methodological: false, domain_expert: false, benchmark_evidence: false };
        this.reviewerStreaming = false;

        queueMicrotask(() => {
          const isReviewerTab = this.activeConversationTab.startsWith('reviewer_');
          if (this.activeMode === 'reviewer' && !isReviewerTab) {
            this.conversationContext.setActiveTab('reviewer_final');
          } else if (this.activeMode !== 'reviewer' && isReviewerTab) {
            this.conversationContext.setActiveTab('results');
          }
        });
      });

    this.conversationContext.activeTab$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((tab) => {
        this.activeConversationTab = tab;
      });


    this.conversationContext.conversations$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((convs) => {
        queueMicrotask(() => {
          let nextRefCount = 0;
          let nextReady = { final: false, journal_editor: false, methodological: false, domain_expert: false, benchmark_evidence: false };
          let nextStreaming = false;

          if (this.activeId) {
            const conv = convs.find((c) => c.id === this.activeId);
            if (conv) {
              for (const r of conv.combinedResponses) {
                if (r.citations) nextRefCount += r.citations.length;
                if (r.reviewerOutput?.final_review)          nextReady.final = true;
                if (r.reviewerOutput?.review_journal_editor) nextReady.journal_editor = true;
                if (r.reviewerOutput?.review_methodological) nextReady.methodological = true;
                if (r.reviewerOutput?.review_domain_expert)  nextReady.domain_expert = true;
                if (r.reviewerOutput?.review_benchmark_evidence) nextReady.benchmark_evidence = true;
                if (r.isStreaming) nextStreaming = true;
              }
            }
          }

          this.referencesCount = nextRefCount;
          this.reviewerReady = nextReady;
          this.reviewerStreaming = nextStreaming;
        });
      });

    this.destroyRef.onDestroy(() => this.clearSidebarAnimations());
  }
  async onNewConversation(): Promise<void> {

    this.activeId = null;

    this.conversationContext.clearActiveModeToDefault();
    this.conversationContext.clearSelectedSpecializedMode();
    this.conversationContext.resetActive();
    this.chatHub.resetSession();

    this.conversationContext.requestClearCurrent();

    this.citations = [];
    this.reasoningSteps = [];
    this.referencesCount = 0;
    this.selectedCitation = null;
    this.highlightedCitationId = null;
    this.toast.info(
      'New conversation started',
      'Ready for a fresh conversation.',
    );
    await this.router.navigate(['/']);
  }

  onOpenSettings() {
    this.router.navigate(['/settings']);
  }
  onOpenAdminPanel(): void {
    this.router.navigate(['/admin']);
  }

  onModeChange(mode: MvpMode): void {
    this.activeMode = mode;
    this.toast.info(
      `${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`,
      `Switched to ${mode} mode`,
    );

  }

  onConversationTabChange(tab: ConversationTab): void {
    this.conversationContext.setActiveTab(tab);
  }

  onRightPanelTabChange(tab: RightPanelTab): void {
    this.rightPanelActiveTab = tab;
  }

  onRightPanelCollapse(): void {
    this.rightPanelCollapsed = !this.rightPanelCollapsed;
  }

  onCitationClick(citation: Citation): void {
    this.highlightedCitationId = citation.id;

    if (citation.doi) {
      const newWin = window.open(
        `https://doi.org/${citation.doi}`,
        '_blank',
        'noopener,noreferrer',
      );
      if (newWin) newWin.opener = null;
    }
  }

  onCitationSelect(citation: Citation): void {
    this.selectedCitation = citation;
    this.highlightedCitationId = citation.id;
    this.rightPanelActiveTab = 'details';
  }

  onConversationSelected(conv: SavedConversation): void {
    this.router.navigate(['/conversation', conv.id]);
  }

  async onConversationDeleted(id: string): Promise<void> {
    try {
      this.projectService.removeConversationFromAllProjects(id);
      await this.conversationContext.deleteConversationServer(id);
      this.conversations = this.conversationContext.getConversations();
      this.toast.info(
        `Conversation deleted`,
        'The conversation has been removed.',
      );

      const pathOnly = this.router.url.split(/[?#]/)[0];
      if (pathOnly === `/conversation/${id}`) {
        await this.router.navigate(['/']);
      }
    } catch {
      this.toast.error(
        'Failed to delete conversation. Please try again.',
        'Delete failed',
      );
    }
  }

  onLoadMoreConversations(): void {
    this.conversationContext.loadMoreSessions();
  }

  onSignOut() {
    this.auth.logout(true);
    this.router.navigate(['/auth']);
  }

  onEulaAccept(acknowledgments: EulaAcknowledgments): void {
    if (this.eulaSubmitting) return;
    this.eulaSubmitting = true;
    this.eula
      .accept(acknowledgments)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.eulaSubmitting = false;
        },
        error: () => {
          this.eulaSubmitting = false;
          this.toast.error(
            'Could not save your agreement',
            'Something went wrong. Please try again.',
          );
        },
      });
  }

  onEulaDecline(): void {
    if (this.eulaSubmitting) return;
    this.auth.logout(true);
  }

  private clearSidebarAnimations(): void {
    if (this.sidebarTimer !== null) {
      window.clearTimeout(this.sidebarTimer);
      this.sidebarTimer = null;
    }
    if (this.sidebarRaf !== null) {
      window.cancelAnimationFrame(this.sidebarRaf);
      this.sidebarRaf = null;
    }
  }
  onToggleSidebar(): void {
    const duration = 250;

    this.clearSidebarAnimations();

    if (!this.sidebarHidden) {
      this.sidebarHidden = true;
      this.sidebarTimer = window.setTimeout(() => {
        this.sidebarCollapsed = true;
        this.sidebarTimer = null;
      }, duration);
    } else {
      this.sidebarCollapsed = false;
      this.sidebarRaf = window.requestAnimationFrame(() => {
        this.sidebarHidden = false;
        this.sidebarRaf = null;
      });
    }
  }


  onCloseSidebar(): void {
    if (!this.sidebarHidden) {
      this.onToggleSidebar();
    }
  }


  onNewConversationMobile(): void {
    this.onNewConversation();
    this.closeSidebarOnMobile();
  }

  onNewProjectMobile(): void {
    this.closeSidebarOnMobile();
  }

  onOpenSettingsMobile(): void {
    this.onOpenSettings();
    this.closeSidebarOnMobile();
  }

  onOpenAdminPanelMobile(): void {
    this.onOpenAdminPanel();
    this.closeSidebarOnMobile();
  }

  onOpenFeedback(): void {
    this.router.navigate(['/feedback']);
  }

  onOpenFeedbackMobile(): void {
    this.onOpenFeedback();
    this.closeSidebarOnMobile();
  }


  onConversationSelectedMobile(conv: SavedConversation): void {
    this.onConversationSelected(conv);
    this.closeSidebarOnMobile();
  }

  private closeSidebarOnMobile(): void {
    if (window.innerWidth < 1024 && !this.sidebarHidden) {
      this.onToggleSidebar();
    }
  }
}
