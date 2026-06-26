import { Component, EventEmitter, inject, Input, Output } from '@angular/core';

import { ButtonComponent } from '../../shared/button/button.component';
import { ConversationTab } from '../../services/conversation-context.service';
import { ThemeService } from '../../services/theme.service';
import { MvpMode } from '../../constants/modes.constants';

export type { MvpMode } from '../../constants/modes.constants';

@Component({
    selector: 'app-header',
    imports: [ButtonComponent],
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  readonly theme = inject(ThemeService);
  @Input() userEmail: string | null = null;
  @Input() activeMode: MvpMode = 'literature';
  @Input() activeTab: ConversationTab = 'results';
  @Input() activeModeName: string = 'Data Synthesis and Literature Analyzer (MVP1)';
  @Input() reasoningStepsCount: number = 0;
  @Input() referencesCount: number = 0;
  @Input() showTabs: boolean = true;
  @Input() reviewerReady: { final: boolean; journal_editor: boolean; methodological: boolean; domain_expert: boolean; benchmark_evidence: boolean } = {
    final: false,
    journal_editor: false,
    methodological: false,
    domain_expert: false,
    benchmark_evidence: false,
  };
  @Input() reviewerStreaming: boolean = false;
  @Output() signOut = new EventEmitter<void>();
  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() modeChange = new EventEmitter<MvpMode>();
  @Output() tabChange = new EventEmitter<ConversationTab>();

  onSignOut(): void {
    this.signOut.emit();
  }

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  onModeChange(mode: MvpMode): void {
    this.modeChange.emit(mode);
  }

  onTabChange(tab: ConversationTab): void {
    this.tabChange.emit(tab);
  }
}
