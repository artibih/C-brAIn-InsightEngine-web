import { Component, OnDestroy, OnInit } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { ConversationDetailComponent } from '../conversation-detail/conversation-detail.component';
import { SavedConversation } from '../../../models/conversation.models';
import { ConversationContextService } from '../../../services/conversation-context.service';
import { ChatHubService } from '../../../core/signalr/chat-hub.service';

@Component({
    selector: 'app-conversation-page',
    standalone: true,
    imports: [ConversationDetailComponent],
    templateUrl: './conversation-page.component.html',
    styleUrls: ['./conversation-page.component.scss']
})
export class ConversationPageComponent implements OnInit, OnDestroy {
  selectedConversation: SavedConversation | null = null;
  isLoading = false;

  private subs = new Subscription();
  private currentConversationId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private conversationContext: ConversationContextService,
    private router: Router,
    private chatHub: ChatHubService
  ) {}
  ngOnInit(): void {
    this.subs.add(
      this.route.paramMap.subscribe((params) => {
        const id = params.get('id');
        this.currentConversationId = id;

        if (!id) {
          this.selectedConversation = null;
          this.isLoading = false;
          this.conversationContext.resetActive();
          return;
        }

        this.conversationContext.setActiveConversation(id);

        if (!this.conversationContext.isSessionPending(id)) {
          this.isLoading = true;
          this.conversationContext.loadConversation(id)
            .catch(console.error)
            .finally(() => this.isLoading = false);
          this.chatHub.joinSession(id).catch(err =>
            console.error('JoinSession failed', err)
          );
        }
      })
    );

    this.subs.add(
      this.conversationContext.conversations$.subscribe((list) => {
        if (!this.currentConversationId) {
          this.selectedConversation = null;
          return;
        }
        this.selectedConversation =
          list.find(c => c.id === this.currentConversationId) ?? this.selectedConversation;
      })
    );
  }


  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.conversationContext.setActiveConversation(null);
  }

  onClearAndStartFresh(): void {
    this.router.navigate(['/']);
  }

  onClearAll(): void {
    if (!this.selectedConversation?.id) return;

    this.conversationContext.clearConversationResponses(this.selectedConversation.id);

  }
}
