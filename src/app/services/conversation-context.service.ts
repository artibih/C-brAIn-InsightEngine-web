import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, combineLatest, Subject, TimeoutError } from 'rxjs';
import {
  SavedConversation,
  CombinedResponse,
  AgentStep,
  RagResponse,
  RagChunk,
  Citation,
  StreamError,
  ReviewerOutput,
} from '../models/conversation.models';
import { ChatHubService } from '../core/signalr/chat-hub.service';
import { ChatApiService } from './chat-api.service';
import { firstValueFrom } from 'rxjs';
import { map, first, timeout } from 'rxjs/operators';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type Provider = 'openai' | 'gemini' | 'perplexity' | string;
export type QuickMode =
  | 'creative_media'
  | 'data_analysis'
  | 'super_consultant'
  | 'default';
export type ActiveChatMode =
  | { kind: 'quick'; mode: QuickMode }
  | { kind: 'specialized'; id: string; name: string };
export type ConversationTab =
  | 'results'
  | 'reasoning'
  | 'references'
  | 'reviewer_final'
  | 'reviewer_journal_editor'
  | 'reviewer_methodological'
  | 'reviewer_domain_expert'
  | 'reviewer_benchmark_evidence';

@Injectable({ providedIn: 'root' })
export class ConversationContextService {
  private conversations: SavedConversation[] = [];

  private conversationsSubject = new BehaviorSubject<SavedConversation[]>([]);
  conversations$ = this.conversationsSubject.asObservable();

  private activeConversationId: string | null = null;
  private pendingBySession = new Set<string>();
  private pendingTempId: string | null = null;
  private pendingTempIdQueue: string[] = [];

  private currentPage = 1;
  private readonly pageSize = 200;
  private _hasMoreSessions = false;
  private _loadingMore = false;

  private hasMoreSubject = new BehaviorSubject<boolean>(false);
  hasMoreSessions$ = this.hasMoreSubject.asObservable();

  private loadingMoreSubject = new BehaviorSubject<boolean>(false);
  loadingMoreSessions$ = this.loadingMoreSubject.asObservable();

  private selectedSpecializedModeSubject = new BehaviorSubject<{
    id: string;
    name: string;
  } | null>(null);
  selectedSpecializedMode$ = this.selectedSpecializedModeSubject.asObservable();

  private activeModeSubject = new BehaviorSubject<ActiveChatMode>({
    kind: 'quick',
    mode: 'creative_media',
  });
  activeMode$ = this.activeModeSubject.asObservable();

  private activeTabSubject = new BehaviorSubject<ConversationTab>('results');
  activeTab$ = this.activeTabSubject.asObservable();

  private autosaveEnabledSubject = new BehaviorSubject<boolean>(false);
  autosaveEnabled$ = this.autosaveEnabledSubject.asObservable();

  sidebarConversations$ = combineLatest([
    this.conversations$,
    this.autosaveEnabled$,
  ]).pipe(
    map(([list, autosave]) => list.filter((c) => autosave || !c.isDraft)),
  );

  private clearCurrentSubject = new Subject<void>();
  clearCurrent$ = this.clearCurrentSubject.asObservable();

  requestClearCurrent(): void {
    this.clearCurrentSubject.next();
  }

  constructor(
    private chatHub: ChatHubService,
    private chatApi: ChatApiService,
    private zone: NgZone,
  ) {
    this.emit();
    const saved = this.readAutosaveSetting();
    this.autosaveEnabledSubject.next(saved);

    this.chatHub.chunk$?.subscribe((chunk: any) => {
      this.zone.run(() => {
        const sessionId = chunk?.sessionId ?? chunk?.SessionId;
        if (!sessionId) return;
        this.appendAssistantChunk(sessionId, chunk);
      });
    });

    this.chatHub.completed$?.subscribe((done: any) => {
      this.zone.run(() => {
        const sessionId = done?.sessionId ?? done?.SessionId;
        if (!sessionId) return;
        const messageId =
          done?.messageId ??
          done?.MessageId ??
          done?.assistantMessageId ??
          done?.AssistantMessageId ??
          done?.id ??
          done?.Id ??
          null;
        this.finalizeAssistantMessage(
          sessionId,
          messageId ? String(messageId) : null,
        );
      });
    });

    this.chatHub.error$?.subscribe((err: any) => {
      this.zone.run(() => {
        const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
        const rawId = err?.sessionId ?? err?.SessionId;
        const sessionId =
          rawId && rawId !== EMPTY_GUID ? rawId : this.activeConversationId;
        if (!sessionId) return;

        let conv = this.getConversationById(sessionId);
        if (!conv && this.pendingTempId) {
          conv = this.getConversationById(this.pendingTempId);
        }
        const last =
          conv?.combinedResponses?.[conv.combinedResponses.length - 1];
        if (last) {
          last.isStreaming = false;
          last.streamError = this.parseStreamError(err);
        }
        this.pendingBySession.delete(sessionId);
        if (this.pendingTempId) {
          this.pendingBySession.delete(this.pendingTempId);
        }
        this.emit();
      });
    });
  }

  setPendingTempId(tempId: string): void {
    this.pendingTempId = tempId;
    if (tempId) {
      this.pendingTempIdQueue.push(tempId);
    } else {

    }
  }

  waitForSessionCreated(tempId: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.unsubscribe();
        this.removePendingTempId(tempId);
        reject(new Error('SessionCreated event timeout after 120s'));
      }, 120_000);

      const sub = this.chatHub.sessionCreated$.subscribe((evt) => {
        const realId = evt.sessionId;
        if (!realId) return;

        const idx = this.pendingTempIdQueue.indexOf(tempId);
        if (idx !== 0) return;

        this.pendingTempIdQueue.splice(0, 1);
        clearTimeout(timer);
        sub.unsubscribe();
        resolve(realId);
      });
    });
  }

  private removePendingTempId(tempId: string): void {
    const idx = this.pendingTempIdQueue.indexOf(tempId);
    if (idx >= 0) this.pendingTempIdQueue.splice(idx, 1);
  }

  async initAfterLogin(): Promise<void> {
    this.conversations = [];
    this.conversationsSubject.next([]);
    await this.loadMySessions();
  }

  private isPending(sessionId: string): boolean {
    const conv = this.getConversationById(sessionId);
    const last = conv?.combinedResponses?.[conv.combinedResponses.length - 1];
    return this.pendingBySession.has(sessionId) || !!last?.isStreaming;
  }

  isSessionPending(sessionId: string): boolean {
    return this.pendingBySession.has(sessionId);
  }

  hasSelectedMode(): boolean {
    const m = this.activeModeSubject.value;
    return !(m.kind === 'quick' && m.mode === 'data_analysis');
  }

  setActiveQuickMode(mode: QuickMode) {
    this.activeModeSubject.next({ kind: 'quick', mode });
    this.selectedSpecializedModeSubject.next(null);
  }

  setActiveTab(tab: ConversationTab) {
    this.activeTabSubject.next(tab);
  }

  getActiveTab(): ConversationTab {
    return this.activeTabSubject.value;
  }

  private modeFromActive(active: ActiveChatMode): 'rag' | 'chat' | 'reviewer' {
    if (active.kind === 'quick') {
      if (active.mode === 'creative_media') return 'rag';
      if (active.mode === 'super_consultant') return 'reviewer';
    }
    return 'chat';
  }

  private modeFromServer(raw: any): 'rag' | 'chat' | 'reviewer' | undefined {
    const s = String(raw ?? '').toLowerCase();
    if (s === 'rag') return 'rag';
    if (s === 'reviewer') return 'reviewer';
    if (s) return 'chat';
    return undefined;
  }

  setActiveSpecializedMode(m: { id: string; name: string }) {
    this.activeModeSubject.next({
      kind: 'specialized',
      id: m.id,
      name: m.name,
    });
    this.selectedSpecializedModeSubject.next(m);
  }

  clearActiveModeToDefault() {
    this.activeModeSubject.next({ kind: 'quick', mode: 'creative_media' });
    this.selectedSpecializedModeSubject.next(null);
  }

  getActiveMode(): ActiveChatMode {
    return this.activeModeSubject.value;
  }

  createEmptyConversation(sessionId: string): SavedConversation {
    const now = new Date();

    const conv: SavedConversation = {
      id: sessionId,
      title: 'New conversation',
      timestamp: now,
      combinedResponses: [],
      isDraft: true,
      mode: 'chat',
    };

    this.conversations = [conv, ...this.conversations];
    this.activeConversationId = sessionId;
    this.emit();

    return conv;
  }

  getConversations(): SavedConversation[] {
    return this.conversations;
  }

  getConversationById(id: string): SavedConversation | null {
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  deleteConversation(id: string): void {
    this.conversations = this.conversations.filter((c) => c.id !== id);
    this.pendingBySession.delete(id);
    if (this.activeConversationId === id) this.activeConversationId = null;
    this.emit();
  }

  async deleteConversationServer(id: string): Promise<void> {
    const conversationsSnapshot = [...this.conversations];
    const activeIdSnapshot = this.activeConversationId;
    const pendingSnapshot = new Set(this.pendingBySession);

    this.deleteConversation(id);

    try {
      await firstValueFrom(this.chatApi.deleteSession(id));
    } catch (e) {
      this.conversations = conversationsSnapshot;
      this.activeConversationId = activeIdSnapshot;
      this.pendingBySession = pendingSnapshot;

      this.emit();
      throw e;
    }
  }

  clearConversationResponses(conversationId: string): void {
    const conversation = this.getConversationById(conversationId);
    if (conversation) {
      conversation.combinedResponses = [];
      this.emit();
    }
  }

  resetActive(): void {
    this.activeConversationId = null;
    this.emit();
  }

  setActiveConversation(id: string | null): void {
    this.activeConversationId = id;
    this.emit();
  }

  replaceConversationId(oldId: string, newId: string): void {
    if (oldId === newId) return;

    const conv = this.getConversationById(oldId);
    if (!conv) return;

    const existingNew = this.conversations.find(
      (c) => c.id === newId && c !== conv,
    );
    if (existingNew) {
      existingNew.combinedResponses = conv.combinedResponses?.length
        ? conv.combinedResponses
        : existingNew.combinedResponses;
      existingNew.title =
        conv.title && conv.title !== 'New conversation'
          ? conv.title
          : existingNew.title;
      existingNew.isDraft = false;
      existingNew.mode = existingNew.mode ?? conv.mode;
      existingNew.projectId = existingNew.projectId ?? conv.projectId ?? null;

      this.conversations = this.conversations.filter((c) => c !== conv);
    } else {
      conv.id = newId;
    }

    if (this.activeConversationId === oldId) {
      this.activeConversationId = newId;
    }

    this.pendingBySession.delete(oldId);
    this.pendingBySession.add(newId);

    this.emit();
  }

  createConversationFromFirstMessage(
    userMessage: string,
    sessionId: string,
    attachments?: { name: string; size: number }[],
  ): SavedConversation {
    const now = new Date();
    const title = (userMessage?.slice(0, 60) || 'New conversation') + '...';

    const existing = this.getConversationById(sessionId);
    if (existing) {
      existing.title = title;
      existing.timestamp = now;
      existing.isDraft = false;
      if (!existing.mode) {
        existing.mode = this.modeFromActive(this.getActiveMode());
      }

      if (existing.combinedResponses.length > 0) {
        const firstTurn = existing.combinedResponses[0];
        if (!firstTurn.userMessage?.content) {
          firstTurn.userMessage = {
            content: userMessage,
            timestamp: now,
            attachments,
          };
        }
      } else {
        existing.combinedResponses.push({
          id: uuid(),
          userMessage: { content: userMessage, timestamp: now, attachments },
          synthesizedResponse: '',
          individualResponses: [],
          timestamp: now,
          isStreaming: true,
          chatMode: this.getActiveMode(),
        });
      }

      this.activeConversationId = sessionId;
      this.emit();
      return existing;
    }

    const combined: CombinedResponse = {
      id: uuid(),
      userMessage: { content: userMessage, timestamp: now, attachments },
      synthesizedResponse: '',
      individualResponses: [],
      timestamp: now,
      isStreaming: true,
      chatMode: this.getActiveMode(),
    };

    const activeMode = this.getActiveMode();
    const convMode = this.modeFromActive(activeMode);

    const conv: SavedConversation = {
      id: sessionId,
      title,
      timestamp: now,
      combinedResponses: [combined],
      isDraft: false,
      mode: convMode,
    };

    this.conversations = [conv, ...this.conversations];
    this.activeConversationId = sessionId;
    this.pendingBySession.add(sessionId);
    this.emit();

    return conv;
  }

  addUserTurn(
    conversationId: string,
    userMessage: string,
    attachments?: { name: string; size: number }[],
  ): void {
    let conv = this.getConversationById(conversationId);

    if (!conv) {
      conv = this.createEmptyConversation(conversationId);
    }
    if (!conv.title || conv.title === 'New conversation') {
      conv.title = userMessage?.slice(0, 60) || 'Conversation';
    }
    this.pendingBySession.add(conversationId);
    const now = new Date();

    const combined: CombinedResponse = {
      id: uuid(),
      userMessage: { content: userMessage, timestamp: now, attachments },
      synthesizedResponse: '',
      individualResponses: [],
      timestamp: now,
      isStreaming: true,
      chatMode: this.getActiveMode(),
    };

    conv.combinedResponses.push(combined);
    conv.messageCount = (conv.messageCount ?? 0) + 1;
    conv.timestamp = now;

    this.emit();
  }

  private appendAssistantChunk(conversationId: string, chunk: any): void {
    let conv = this.getConversationById(conversationId);
    if (!conv) {

      const tempId = this.pendingTempId ?? this.pendingTempIdQueue[0] ?? null;
      if (tempId) {
        this.replaceConversationId(tempId, conversationId);
        if (this.pendingTempId === tempId) this.pendingTempId = null;
        this.removePendingTempId(tempId);
        conv = this.getConversationById(conversationId);
      }
    }
    if (!conv) conv = this.createEmptyConversation(conversationId);

    if (conv.combinedResponses.length === 0) {
      const now = new Date();
      conv.combinedResponses.push({
        id: uuid(),
        userMessage: { content: '', timestamp: now },
        synthesizedResponse: '',
        individualResponses: [],
        timestamp: now,
        isStreaming: true,
      });
    }

    const last = conv.combinedResponses[conv.combinedResponses.length - 1];
    last.isStreaming = true;

    const source: 'assistant' | 'rag' | 'reviewer' | undefined = chunk?._source;
    if (source && !last.streamSource) {
      last.streamSource = source;
    }

    if (source === 'reviewer' && conv.mode !== 'reviewer') {
      conv.mode = 'reviewer';
    }

    const delta: string = chunk?.delta ?? chunk?.Delta ?? '';
    if (!delta) return;

    if (source === 'rag') {

      if (this.tryApplyRagDelta(last, delta)) {
        this.emit();
        return;
      }

      last.synthesizedResponse = (last.synthesizedResponse || '') + delta;
      this.emit();
      return;
    }

    if (this.tryApplyAgentUpdate(last, delta)) {
      this.emit();
      return;
    }

    if (this.tryApplyReviewerDelta(last, delta)) {
      this.emit();
      return;
    }

    if (this.tryApplyMetadataDelta(last, delta)) {
      this.emit();
      return;
    }

    if (this.isEventDelta(delta)) {
      this.emit();
      return;
    }

    last.synthesizedResponse = (last.synthesizedResponse || '') + delta;
    this.emit();
  }


  private isEventDelta(delta: string): boolean {
    const trimmed = delta.trim();
    if (!trimmed.startsWith('{')) return false;

    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        parsed.event === true
      ) {
        return true;
      }
    } catch {

    }

    return false;
  }

  private tryApplyAgentUpdate(last: CombinedResponse, delta: string): boolean {
    const trimmed = delta.trim();
    if (!trimmed.startsWith('{')) return false;

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.type !== 'agent_update') return false;

      const agent = parsed.agent ?? 'Agent';
      const status = parsed.status ?? 'running';
      const message = parsed.message ?? '';

      const displayName = agent
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());

      last.activeAgentName = displayName;
      last.activeAgentMessage = message;

      if (!last.agentSteps) last.agentSteps = [];

      let agentData = parsed.data ?? null;
      if (!agentData) {
        const {
          type: _t,
          agent: _a,
          status: _s,
          message: _m,
          ...rest
        } = parsed;
        if (Object.keys(rest).length > 0) {
          agentData = rest;
        }
      }

      const stepId: string | undefined =
        parsed.step_id ?? agentData?.step_id ?? undefined;
      const stepText: string | undefined =
        parsed.step_text ?? agentData?.step_text ?? undefined;

      if (agent === 'hypothesis_planner') {
        const existing = last.agentSteps.find((s) => s.agent === agent);
        if (existing) {
          existing.status = status;
          existing.message = message;
          if (agentData) existing.data = agentData;
        } else {
          last.agentSteps.push({
            agent,
            status,
            message,
            timestamp: new Date(),
            data: agentData,
          });
        }
      } else if (stepId) {

        const existing = last.agentSteps.find(
          (s) => s.agent === agent && s.stepId === stepId,
        );
        if (existing) {
          existing.status = status;
          existing.message = message;
          existing.timestamp = new Date();
          if (agentData) existing.data = agentData;
          if (stepText) existing.stepText = stepText;
        } else {
          last.agentSteps.push({
            agent,
            status,
            message,
            timestamp: new Date(),
            data: agentData,
            stepId,
            stepText,
          });
        }
      } else {

        last.agentSteps.push({
          agent,
          status,
          message,
          timestamp: new Date(),
          data: agentData,
          stepId,
          stepText,
        });
      }

      last.agentSteps = [...last.agentSteps];


      return true;
    } catch {
      return false;
    }
  }


  private tryApplyReviewerDelta(
    last: CombinedResponse,
    delta: string,
  ): boolean {
    let s = delta.trim();
    if (s.startsWith('data:')) s = s.slice(5).trim();
    if (!s.startsWith('{')) return false;

    try {
      const parsed = JSON.parse(s);
      const inner = parsed?.data;
      if (!inner || typeof inner !== 'object' || Array.isArray(inner))
        return false;

      const REVIEWER_KEYS = [
        'review_journal_editor',
        'review_methodological',
        'review_domain_expert',
        'review_benchmark_evidence',
        'final_review',
      ] as const;

      const matched = REVIEWER_KEYS.find((k) => k in inner);
      if (!matched) return false;

      if (!last.reviewerOutput) last.reviewerOutput = {};
      (last.reviewerOutput as any)[matched] = inner[matched];

      last.reviewerOutput = { ...last.reviewerOutput };
      return true;
    } catch {
      return false;
    }
  }

  private tryApplyRagDelta(last: CombinedResponse, delta: string): boolean {
    const trimmed = delta.trim();
    if (!trimmed.startsWith('{')) return false;

    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return false;

      const type = parsed.type ?? '';
      const hasAnswer = typeof parsed.answer === 'string';
      const isRagType = type === 'rag_response' || type === 'rag_result';

      if (!hasAnswer && !isRagType) return false;

      const rawChunks = parsed.chunks ?? parsed.references ?? [];
      const chunks: RagChunk[] = Array.isArray(rawChunks)
        ? rawChunks
            .map((c: any) => ({
              content: String(c.content ?? c.text ?? ''),
              paperId: c.paperId ?? c.paper_id ?? undefined,
              doi: this.normalizeDoi(c.doi),
              title: c.title ?? undefined,
              authors: this.parseAuthors(c.authors),
              abstract: c.abstract ?? undefined,
              paperUrl: c.paper_url ?? c.paperUrl ?? undefined,
            }))
            .filter((c: RagChunk) => !!c.content || !!c.title)
        : [];

      const answer = parsed.answer ?? '';

      if (!last.ragResponse) {
        last.ragResponse = { answer, chunks };
      } else {
        last.ragResponse = {
          answer: last.ragResponse.answer + answer,
          chunks: [...last.ragResponse.chunks, ...chunks],
        };
      }

      if (answer) {
        last.synthesizedResponse = (last.synthesizedResponse || '') + answer;
      }

      this.populateCitationsFromRag(last);

      return true;
    } catch {
      return false;
    }
  }

  private tryExtractRagChunks(last: CombinedResponse): void {

    if (last.ragResponse) return;

    const text = last.synthesizedResponse ?? '';
    if (!text.trim().startsWith('{')) return;

    try {
      const parsed = JSON.parse(text.trim());
      const rawChunks = parsed.chunks ?? parsed.references ?? [];
      if (typeof parsed.answer === 'string' && Array.isArray(rawChunks)) {
        const chunks: RagChunk[] = rawChunks
          .map((c: any) => ({
            content: String(c.content ?? c.text ?? ''),
            paperId: c.paperId ?? c.paper_id ?? undefined,
            doi: this.normalizeDoi(c.doi),
            title: c.title ?? undefined,
            authors: this.parseAuthors(c.authors),
            abstract: c.abstract ?? undefined,
            paperUrl: c.paper_url ?? c.paperUrl ?? undefined,
          }))
          .filter((c: RagChunk) => !!c.content || !!c.title);

        last.ragResponse = { answer: parsed.answer, chunks };
        last.synthesizedResponse = parsed.answer;
        this.populateCitationsFromRag(last);
      }
    } catch {

    }
  }

  private populateCitationsFromRag(response: CombinedResponse): void {
    const chunks = response.ragResponse?.chunks;
    if (!chunks?.length) return;

    const hasNonRagCitations =
      response.citations?.length &&
      response.citations.some((c) => !c.id.startsWith('rag-chunk-'));
    if (hasNonRagCitations) return;

    const seen = new Set<string>();
    const unique: Citation[] = [];
    let idx = 1;

    for (const chunk of chunks) {
      const content = chunk.content || '';
      const title =
        chunk.title ||
        (() => {
          const dotIdx = content.indexOf('.');
          return dotIdx > 0 && dotIdx < 80
            ? content.slice(0, dotIdx + 1)
            : content.slice(0, 80) + (content.length > 80 ? '...' : '');
        })();

      let key: string;
      if (chunk.doi) {
        key = 'doi:' + chunk.doi.toLowerCase().trim();
      } else {
        const t = (title || '').toLowerCase().trim();
        key = t ? 'title:' + t : 'rag-chunk-' + idx;
      }
      if (seen.has(key)) continue;
      seen.add(key);

      unique.push({
        id: 'rag-chunk-' + (idx - 1),
        index: idx,
        title,
        authors: chunk.authors ?? [],
        abstract: chunk.abstract ?? content,
        doi: chunk.doi,
        paperUrl: chunk.paperUrl,
        sourceType: chunk.doi ? ('doi' as const) : undefined,
      } as Citation);
      idx++;
    }

    response.citations = unique;
  }

  private finalizeAssistantMessage(
    conversationId: string,
    assistantMessageId: string | null = null,
  ): void {
    let conv = this.getConversationById(conversationId);
    if (!conv) {
      const tempId = this.pendingTempId ?? this.pendingTempIdQueue[0] ?? null;
      if (tempId) {
        this.replaceConversationId(tempId, conversationId);
        if (this.pendingTempId === tempId) this.pendingTempId = null;
        this.removePendingTempId(tempId);
        conv = this.getConversationById(conversationId);
      }
    }
    if (!conv || conv.combinedResponses.length === 0) return;

    const last = conv.combinedResponses[conv.combinedResponses.length - 1];
    last.isStreaming = false;
    last.activeAgentName = undefined;
    last.activeAgentMessage = undefined;

    if (assistantMessageId && !last.assistantMessageId) {
      last.assistantMessageId = assistantMessageId;
    }

    if (last.agentSteps) {
      for (const step of last.agentSteps) {
        if (step.status === 'running') step.status = 'completed';
      }
    }

    this.tryExtractRagChunks(last);

    this.populateCitationsFromRag(last);

    this.populateCitationsFromAnalysis(last);

    const isHypothesis = last.agentSteps?.some(
      (s) => s.agent === 'hypothesis_planner' && s.data?.analysis_steps,
    );
    const isAnalysis = last.agentSteps?.some(
      (s) =>
        s.agent === 'statistical_executor' ||
        s.agent === 'synthesizer' ||
        s.agent === 'critical' ||
        s.agent === 'critique_agent',
    );
    if (
      !isHypothesis &&
      !isAnalysis &&
      !last.synthesizedResponse?.trim() &&
      last.agentSteps?.length
    ) {
      const summary = this.buildAgentSummary(last.agentSteps);
      if (summary) last.synthesizedResponse = summary;
    }

    this.pendingBySession.delete(conversationId);
    this.emit();

    this.loadMySessions().catch(() => {});

    if (!last.assistantMessageId) {
      this.loadConversation(conversationId).catch(() => {});
    }
  }

  private buildAgentSummary(steps: AgentStep[]): string {

    let bestData: any = null;
    for (const step of steps) {
      if (step.data) {
        const agent = (step.agent ?? '').toLowerCase().replace(/_/g, '');
        if (agent === 'hypothesisplanner') {
          bestData = step.data;
          break;
        }
        bestData = step.data;
      }
    }

    if (!bestData) return '';

    const lines: string[] = [];

    const objective = bestData.objective;
    const methodologyChecks =
      bestData.methodology_checks ?? bestData.methodologychecks;
    const retrievedLiterature =
      bestData.retrieved_literature ?? bestData.retrievedliterature;
    const findings = bestData.findings;
    const analysisSteps = bestData.analysis_steps ?? bestData.analysissteps;
    const confidenceScore =
      bestData.confidence_score ?? bestData.confidencescore;
    const epistemicStatus =
      bestData.epistemic_status ?? bestData.epistemicstatus;
    const criticFeedback = bestData.critic_feedback ?? bestData.criticfeedback;
    const validationCriteria =
      bestData.validation_criteria ?? bestData.validationcriteria;

    if (objective) {
      lines.push(`**Objective:** ${objective}`);
    }

    if (methodologyChecks?.length) {
      lines.push(
        '**Methodology Notes:**\n' +
          methodologyChecks.map((m: string) => `- ${m}`).join('\n'),
      );
    }

    if (analysisSteps?.length) {
      lines.push(
        '**Analysis Steps:**\n' +
          analysisSteps
            .map(
              (s: any) =>
                `- **${s.stepId ?? s.stepid ?? ''}:** ${s.description ?? s.task ?? ''}`,
            )
            .join('\n'),
      );
    }

    if (retrievedLiterature?.length) {
      lines.push(
        '**Retrieved Literature:**\n' +
          retrievedLiterature.map((l: string) => `- ${l}`).join('\n'),
      );
    }

    if (findings?.length) {
      lines.push(
        '**Findings:**\n' + findings.map((f: string) => `- ${f}`).join('\n'),
      );
    }

    if (validationCriteria?.length) {
      lines.push(
        '**Validation Criteria:**\n' +
          validationCriteria.map((v: string) => `- ${v}`).join('\n'),
      );
    }

    if (confidenceScore != null) {
      lines.push(
        `**Confidence Score:** ${(confidenceScore * 100).toFixed(0)}%`,
      );
    }

    if (epistemicStatus) {
      lines.push(`**Status:** ${epistemicStatus}`);
    }

    if (criticFeedback?.issues?.length) {
      lines.push(
        '**Review Notes:**\n' +
          criticFeedback.issues.map((i: string) => `- ${i}`).join('\n'),
      );
    }

    return lines.join('\n\n');
  }

  private tryApplyMetadataDelta(
    last: CombinedResponse,
    delta: string,
  ): boolean {
    const s = String(delta ?? '').trim();
    if (!s.startsWith('{')) return false;

    let depth = 0;
    let end = -1;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) return false;

    const jsonStr = s.slice(0, end + 1);
    const rest = s.slice(end + 1).trim();

    try {
      const meta = JSON.parse(jsonStr);
      const originals = meta?.originalResponses ?? meta?.OriginalResponses;

      if (!Array.isArray(originals)) return false;

      last.individualResponses = originals.map((x: any) => ({
        provider: String(x?.provider ?? '') as Provider,
        content: String(x?.response ?? ''),
        error: x?.error ?? null,
      })) as any;

      if (rest) {
        last.synthesizedResponse =
          (last.synthesizedResponse || '') +
          (last.synthesizedResponse ? '\n' : '') +
          rest;

        if (!last.individualResponses) last.individualResponses = [];
        if (last.individualResponses.length === 0) {
          last.individualResponses.push({
            provider: 'unknown',
            content: last.synthesizedResponse,
          } as any);
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  private emit(): void {
    this.conversationsSubject.next(
      this.conversations.map((c) => {
        const last = c.combinedResponses?.[c.combinedResponses.length - 1];
        return {
          ...c,
          isStreaming: !!last?.isStreaming || this.pendingBySession.has(c.id),
          combinedResponses: [...(c.combinedResponses ?? [])],
        };
      }),
    );
  }

  async loadMySessions(): Promise<void> {
    this.currentPage = 1;
    const resp = await firstValueFrom(
      this.chatApi.getMySessions(1, this.pageSize),
    );

    const data = (resp as any)?.data;
    const items = data?.items ?? [];
    if (!Array.isArray(items)) {
      return;
    }

    this._hasMoreSessions = data?.hasNext ?? false;
    this.hasMoreSubject.next(this._hasMoreSessions);

    const mapped: SavedConversation[] = items.map((s: any) => ({
      id: s.sessionId ?? s.id,
      title: s.title ?? s.firstMessagePreview ?? 'Conversation',
      timestamp: s.lastActivityAt ?? s.createdAt ?? new Date().toISOString(),
      combinedResponses: [],
      messageCount: s.messageCount ?? 0,
      isDraft: false,
      projectId: s.projectId ?? null,
      mode: this.modeFromServer(s.mode),
    }));

    const byId = new Map<string, SavedConversation>();
    for (const existing of this.conversations) {
      byId.set(existing.id, existing);
    }

    for (const incoming of mapped) {
      const existing = byId.get(incoming.id);
      if (existing) {
        byId.set(incoming.id, {
          ...existing,
          title: incoming.title,
          timestamp: incoming.timestamp,
          messageCount: Math.max(
            incoming.messageCount ?? 0,
            existing.messageCount ?? 0,
          ),
          isDraft: false,
          projectId: incoming.projectId,
          mode: incoming.mode ?? existing.mode,
        });
      } else {
        byId.set(incoming.id, incoming);
      }
    }

    this.conversations = Array.from(byId.values()).sort(
      (a, b) => +new Date(b.timestamp) - +new Date(a.timestamp),
    );

    this.emit();
  }

  async loadMoreSessions(): Promise<void> {
    if (this._loadingMore || !this._hasMoreSessions) return;

    this._loadingMore = true;
    this.loadingMoreSubject.next(true);

    try {
      const nextPage = this.currentPage + 1;
      const resp = await firstValueFrom(
        this.chatApi.getMySessions(nextPage, this.pageSize),
      );

      const data = (resp as any)?.data;
      const items = data?.items ?? [];
      if (!Array.isArray(items)) return;

      this.currentPage = nextPage;
      this._hasMoreSessions = data?.hasNext ?? false;
      this.hasMoreSubject.next(this._hasMoreSessions);

      const mapped: SavedConversation[] = items.map((s: any) => ({
        id: s.sessionId ?? s.id,
        title: s.title ?? s.firstMessagePreview ?? 'Conversation',
        timestamp: s.lastActivityAt ?? s.createdAt ?? new Date().toISOString(),
        combinedResponses: [],
        messageCount: s.messageCount ?? 0,
        isDraft: false,
        projectId: s.projectId ?? null,
        mode: this.modeFromServer(s.mode),
      }));

      const existingIds = new Set(this.conversations.map((c) => c.id));
      const newConvs = mapped.filter((c) => !existingIds.has(c.id));

      this.conversations = [...this.conversations, ...newConvs].sort(
        (a, b) => +new Date(b.timestamp) - +new Date(a.timestamp),
      );

      this.emit();
    } finally {
      this._loadingMore = false;
      this.loadingMoreSubject.next(false);
    }
  }

  async loadConversation(sessionId: string): Promise<void> {
    if (this.isPending(sessionId)) {
      return;
    }
    const resp = await firstValueFrom(this.chatApi.getConversation(sessionId));
    const data = (resp as any)?.data;

    const messages = data?.messages ?? [];
    const title = data?.title ?? data?.firstMessagePreview ?? 'Conversation';
    const createdAt = data?.createdAt ?? new Date().toISOString();

    const existing = this.getConversationById(sessionId);

    let conv: SavedConversation;

    if (!existing) {
      conv = {
        id: sessionId,
        title,
        timestamp: createdAt,
        combinedResponses: [],
      };

      this.conversations = [conv, ...this.conversations];
    } else {
      conv = existing;
      conv.title = title;
      conv.timestamp = createdAt;
    }
    conv.messageCount = data?.messageCount ?? conv.messageCount ?? 0;

    const mapped = this.mapMessagesToCombined(messages);
    if (mapped.length > 0 || conv.combinedResponses.length === 0) {

      if (existing?.combinedResponses?.length) {
        const oldResponses = existing.combinedResponses;
        const minLen = Math.min(mapped.length, oldResponses.length);
        for (let i = 0; i < minLen; i++) {
          const old = oldResponses[i];
          const cur = mapped[i];
          if (old.ragResponse && !cur.ragResponse) {
            cur.ragResponse = old.ragResponse;
            cur.synthesizedResponse =
              old.ragResponse.answer || cur.synthesizedResponse;
            this.populateCitationsFromRag(cur);
          }
          if (old.reviewerOutput && !cur.reviewerOutput)
            cur.reviewerOutput = old.reviewerOutput;
          if (old.chatMode && !cur.chatMode) cur.chatMode = old.chatMode;
          if (old.streamSource && !cur.streamSource)
            cur.streamSource = old.streamSource;
          if (old.citations?.length && !cur.citations?.length)
            cur.citations = old.citations;
          if (
            old.userMessage?.attachments?.length &&
            !cur.userMessage?.attachments?.length
          ) {
            cur.userMessage.attachments = old.userMessage.attachments;
          }
        }
      }
      conv.combinedResponses = mapped;
    }

    const savedMode = conv.mode;
    this.inferModeFromConversation(conv);
    if (savedMode) conv.mode = savedMode;

    this.activeConversationId = sessionId;
    this.emit();
  }

  private inferModeFromConversation(conv: SavedConversation): void {

    for (let i = conv.combinedResponses.length - 1; i >= 0; i--) {
      const mode = conv.combinedResponses[i].chatMode;
      if (mode?.kind) {
        this.activeModeSubject.next(mode);
        this.selectedSpecializedModeSubject.next(
          mode.kind === 'specialized' ? { id: mode.id, name: mode.name } : null,
        );
        conv.mode = this.modeFromActive(mode);
        return;
      }
    }

    const hasReviewer = conv.combinedResponses.some((r) => {
      const ro = r.reviewerOutput;
      return (
        !!ro &&
        (!!ro.review_journal_editor ||
          !!ro.review_methodological ||
          !!ro.review_domain_expert ||
          !!ro.review_benchmark_evidence ||
          !!ro.final_review)
      );
    });
    if (hasReviewer) {
      this.activeModeSubject.next({ kind: 'quick', mode: 'super_consultant' });
      this.selectedSpecializedModeSubject.next(null);
      conv.mode = 'reviewer';
      return;
    }

    const hasRag = conv.combinedResponses.some(
      (r) => r.ragResponse?.chunks?.length || r.streamSource === 'rag',
    );
    if (hasRag) {
      this.activeModeSubject.next({ kind: 'quick', mode: 'creative_media' });
      this.selectedSpecializedModeSubject.next(null);
      conv.mode = 'rag';
      return;
    }

    const hasAgentSteps = conv.combinedResponses.some(
      (r) => r.agentSteps?.length,
    );
    if (hasAgentSteps) {
      this.activeModeSubject.next({ kind: 'quick', mode: 'data_analysis' });
      this.selectedSpecializedModeSubject.next(null);
      conv.mode = 'chat';
      return;
    }

    this.activeModeSubject.next({ kind: 'quick', mode: 'creative_media' });
    this.selectedSpecializedModeSubject.next(null);
    conv.mode = 'chat';
  }

  private mapMessagesToCombined(messages: any[]): CombinedResponse[] {
    const out: CombinedResponse[] = [];
    let current: CombinedResponse | undefined;

    const pushNew = (userText: string, ts: Date) => {
      const turn: CombinedResponse = {
        id: uuid(),
        userMessage: { content: userText, timestamp: ts },
        synthesizedResponse: '',
        individualResponses: [],
        timestamp: ts,
        isStreaming: false,
      };

      out.push(turn);
      current = turn;
      return turn;
    };

    for (const m of messages) {
      const role = String(m.role ?? '').toLowerCase();
      const content = String(m.content ?? '');
      const ts = m.createdAt ? new Date(m.createdAt) : new Date();

      if (role === 'user') {
        const turn = pushNew(content, ts);

        const rawAttachments = m.attachments ?? m.Attachments;
        if (Array.isArray(rawAttachments) && rawAttachments.length) {
          turn.userMessage.attachments = rawAttachments.map((a: any) => ({
            name: a.fileName ?? a.FileName ?? a.name ?? a.Name ?? 'File',
            size: a.sizeBytes ?? a.SizeBytes ?? a.size ?? a.Size ?? 0,
            contentType: a.contentType ?? a.ContentType ?? undefined,
            fileId: a.fileId ?? a.FileId ?? a.id ?? a.Id ?? undefined,
          }));
        }
        continue;
      }

      if (role === 'assistant') {
        const target = current ?? pushNew('', ts);

        const backendId = m.id ?? m.Id;
        if (backendId) target.assistantMessageId = String(backendId);

        const rawRating = m.rating ?? m.Rating;
        const ratingNum =
          typeof rawRating === 'number' ? rawRating : Number(rawRating);
        target.rating =
          Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum : undefined;

        const rawComment = m.feedbackComment ?? m.FeedbackComment;
        target.feedbackComment =
          typeof rawComment === 'string' && rawComment.trim()
            ? rawComment
            : undefined;

        const msgType = String(m.messageType ?? m.type ?? '').toLowerCase();
        if (msgType === 'rag' || msgType === 'rag_response') {
          target.streamSource = 'rag';
        }

        const parsed = this.parseAssistantContent(content);

        target.synthesizedResponse = (parsed.synthesized ?? '').trim() || '';

        if (parsed.agentSteps?.length) {
          target.agentSteps = parsed.agentSteps;
        }

        if (parsed.reviewerOutput) {
          target.reviewerOutput = parsed.reviewerOutput;
        }

        target.individualResponses =
          parsed.originals && parsed.originals.length > 0
            ? parsed.originals
            : [{ provider: 'assistant', content: target.synthesizedResponse }];

        this.tryExtractRagChunks(target);

        this.populateCitationsFromAnalysis(target);

        current = undefined;
      }
    }

    return out;
  }

  private parseAssistantContent(content: string): {
    synthesized: string;
    originals?: any[];
    agentSteps?: AgentStep[];
    reviewerOutput?: ReviewerOutput;
  } {
    const raw = String(content ?? '');
    if (!raw.trim()) return { synthesized: '' };

    let originals: any[] | undefined;
    const textParts: string[] = [];
    const agentSteps: AgentStep[] = [];
    let reviewerOutput: ReviewerOutput | undefined;

    const mergeReviewer = (
      payload: { key: string; value: any } | null,
    ): boolean => {
      if (!payload) return false;
      if (!reviewerOutput) reviewerOutput = {};
      (reviewerOutput as any)[payload.key] = payload.value;
      return true;
    };

    const lines = raw.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        textParts.push('');
        continue;
      }

      if (trimmedLine.startsWith('data:')) {
        const payload = trimmedLine.slice(5).trim();
        if (mergeReviewer(this.tryExtractReviewerPayload(payload))) continue;
        const agentStep = this.tryExtractAgentStep(payload);
        if (agentStep) {
          agentSteps.push(agentStep);
          continue;
        }
        if (this.isFilterableJson(payload)) continue;

        if (payload) textParts.push(payload);
        continue;
      }

      if (trimmedLine.startsWith('metadata:')) {
        const after = trimmedLine.slice('metadata:'.length).trim();
        const metaResult = this.tryExtractMetadata(after);
        if (metaResult) {
          originals = metaResult.originals;
          if (metaResult.rest) textParts.push(metaResult.rest);
          continue;
        }
      }

      if (trimmedLine.startsWith('{')) {
        if (mergeReviewer(this.tryExtractReviewerPayload(trimmedLine)))
          continue;

        const metaResult = this.tryExtractMetadata(trimmedLine);
        if (metaResult) {
          originals = metaResult.originals;
          if (metaResult.rest) textParts.push(metaResult.rest);
          continue;
        }

        const agentStep = this.tryExtractAgentStep(trimmedLine);
        if (agentStep) {
          agentSteps.push(agentStep);
          continue;
        }

        if (this.isFilterableJson(trimmedLine)) continue;
      }

      textParts.push(line);
    }

    let synthesized = textParts
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!synthesized && agentSteps.length > 0) {
      synthesized = this.buildAgentSummary(agentSteps);
    }

    return {
      synthesized,
      originals,
      agentSteps: agentSteps.length > 0 ? agentSteps : undefined,
      reviewerOutput,
    };
  }

  private tryExtractAgentStep(str: string): AgentStep | null {
    const trimmed = str.trim();
    if (!trimmed.startsWith('{')) return null;

    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return null;

      const type = String(parsed.type ?? parsed.Type ?? '').toLowerCase();
      if (type !== 'agent_update' && type !== 'agentupdate') {

        if (!parsed.agent || !parsed.status) return null;
      }

      let data = parsed.data ?? null;
      if (!data) {
        const {
          type: _t,
          Type: _T,
          agent: _a,
          status: _s,
          message: _m,
          ...rest
        } = parsed;
        if (Object.keys(rest).length > 0) {
          data = rest;
        }
      }

      const stepId = parsed.step_id ?? data?.step_id ?? undefined;
      const stepText = parsed.step_text ?? data?.step_text ?? undefined;

      return {
        agent: parsed.agent ?? 'unknown',
        status: parsed.status ?? 'completed',
        message: parsed.message ?? '',
        timestamp: new Date(),
        data,
        stepId,
        stepText,
      };
    } catch {
      return null;
    }
  }

  private tryExtractReviewerPayload(
    str: string,
  ): { key: string; value: any } | null {
    const trimmed = str.trim();
    if (!trimmed.startsWith('{')) return null;

    try {
      const parsed = JSON.parse(trimmed);
      const inner = parsed?.data;
      if (!inner || typeof inner !== 'object' || Array.isArray(inner))
        return null;

      const REVIEWER_KEYS = [
        'review_journal_editor',
        'review_methodological',
        'review_domain_expert',
        'review_benchmark_evidence',
        'final_review',
      ];

      for (const key of REVIEWER_KEYS) {
        if (key in inner) return { key, value: inner[key] };
      }
      return null;
    } catch {
      return null;
    }
  }

  private isFilterableJson(str: string): boolean {
    const trimmed = str.trim();
    if (!trimmed.startsWith('{')) return false;

    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return false;

      const type = String(parsed.type ?? parsed.Type ?? '').toLowerCase();

      if (type === 'agent_update' || type === 'agentupdate') return true;

      if (parsed.event === true) return true;

      if (type === 'hypothesis_plan' || type === 'hypothesisplan') return true;
      if (parsed.analysis_steps || parsed.analysissteps) return true;

      if (
        parsed.data &&
        typeof parsed.data === 'object' &&
        !Array.isArray(parsed.data)
      ) {
        const REVIEWER_KEYS = [
          'review_journal_editor',
          'review_methodological',
          'review_domain_expert',
          'review_benchmark_evidence',
          'final_review',
        ];
        if (REVIEWER_KEYS.some((k) => k in parsed.data)) return true;
      }

      if (parsed.agent && parsed.status) return true;

      return false;
    } catch {
      return false;
    }
  }

  private tryExtractMetadata(
    str: string,
  ): { originals: any[]; rest: string } | null {
    const trimmed = str.trim();
    if (!trimmed.startsWith('{')) return null;

    let depth = 0;
    let end = -1;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) return null;

    const jsonStr = trimmed.slice(0, end + 1);
    const rest = trimmed.slice(end + 1).trim();

    try {
      const meta = JSON.parse(jsonStr);
      const originalsRaw = meta?.originalResponses ?? meta?.OriginalResponses;

      const isMeta = meta?.type === 'metadata' || meta?.Type === 'metadata';
      if (!Array.isArray(originalsRaw) && !isMeta) return null;

      const originals = Array.isArray(originalsRaw)
        ? originalsRaw.map((x: any) => ({
            provider: String(x?.provider ?? 'unknown'),
            content: String(x?.response ?? ''),
            error: x?.error ?? null,
          }))
        : [];

      return { originals, rest };
    } catch {
      return null;
    }
  }

  private populateCitationsFromAnalysis(response: CombinedResponse): void {

    if (response.citations?.length) return;

    const steps = response.agentSteps;
    if (!steps?.length) return;

    const citations: Citation[] = [];
    let index = 1;

    for (const step of steps) {
      if (!step.data) continue;
      const agent = (step.agent ?? '').toLowerCase().replace(/_/g, '');

      if (agent === 'synthesizer') {
        const rawFindings: any[] = step.data.findings ?? [];
        if (Array.isArray(rawFindings)) {
          const seenCitationNumbers = new Set<number>();
          const items = rawFindings.flat();
          for (const f of items) {
            if (!f || typeof f !== 'object') continue;
            const cit = f.citation;
            if (!cit || typeof cit !== 'object') continue;
            const citNum = cit.citation_number ?? cit.citationNumber;
            if (citNum == null || seenCitationNumbers.has(citNum)) continue;
            seenCitationNumbers.add(citNum);

            const doi = this.normalizeDoi(cit.doi_url ?? cit.doiUrl ?? cit.doi);
            const authors = this.parseAuthors(cit.authors) ?? [];
            const paperUrl = cit.paper_url ?? cit.paperUrl ?? undefined;

            citations.push({
              id: `analysis-synth-${citNum}`,
              index: citNum,
              title: cit.title ?? '',
              authors,
              abstract: cit.abstract ?? undefined,
              doi,
              paperUrl,
              url: cit.doi_url ?? cit.doiUrl ?? undefined,
              sourceType: doi ? 'doi' : 'web',
            });
          }

          citations.sort((a, b) => a.index - b.index);
          index = citations.length + 1;
        }
      }

      if (agent === 'knowledgeretriever') {
        const sources: any[] = step.data.sources ?? [];
        if (Array.isArray(sources) && sources.length > 0) {
          for (const src of sources) {
            if (!src || typeof src !== 'object') continue;
            const content = String(src.content ?? src.text ?? '');
            const srcTitle = src.title ?? '';

            if (!content.trim() && !srcTitle.trim()) continue;
            const title =
              srcTitle ||
              (content.length > 80 ? content.slice(0, 80) + '...' : content);
            const doi = this.normalizeDoi(src.doi);
            const authors = this.parseAuthors(src.authors) ?? [];
            const paperUrl = src.paper_url ?? src.paperUrl ?? undefined;
            citations.push({
              id: `analysis-lit-${index}`,
              index,
              title,
              authors,
              abstract: src.abstract ?? (content || undefined),
              doi,
              paperUrl,
              url: src.url,
              sourceType: doi ? 'doi' : 'web',
            });
            index++;
          }
        } else {

          const literature: string[] =
            step.data.retrieved_literature ??
            step.data.retrievedliterature ??
            [];
          for (const lit of literature) {
            if (typeof lit !== 'string' || !lit.trim()) continue;
            citations.push({
              id: `analysis-lit-${index}`,
              index,
              title: lit.length > 80 ? lit.slice(0, 80) + '...' : lit,
              authors: [],
              abstract: lit,
              sourceType: 'web',
            });
            index++;
          }
        }
      }
    }

    if (citations.length > 0) {

      const seen = new Set<string>();
      const unique: Citation[] = [];
      for (const c of citations) {
        let key: string;
        if (c.doi) {
          key = 'doi:' + c.doi.toLowerCase().trim();
        } else {
          const t = (c.title || '').toLowerCase().trim();
          key = t ? 'title:' + t : c.id;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(c);
      }

      unique.sort((a, b) => a.index - b.index);
      response.citations = unique;
    }
  }

  private parseStreamError(err: any): StreamError {
    const code = err?.errorCode ?? err?.ErrorCode ?? '';
    const raw = err?.message ?? err?.Message ?? '';

    const statusMatch = raw.match(/(\d{3})\s*\(/);
    const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0;

    const lower = raw.toLowerCase();
    const mentionsAvailability =
      lower.includes('not available') ||
      lower.includes('unavailable') ||
      lower.includes('not supported') ||
      lower.includes('unsupported') ||
      lower.includes('unknown model') ||
      lower.includes('invalid model');
    const mentionsModel = lower.includes('model') || lower.includes('provider');
    const isLlmSelectionError =
      code === 'LLM_SELECTION_ERROR' ||
      lower.includes('llm_selection') ||
      lower.includes('model_key') ||
      lower.includes('llm selection') ||
      (mentionsModel && mentionsAvailability);
    if (isLlmSelectionError) {
      return {
        title: 'Model Unavailable',
        message: 'Selected model is not available. Please choose another model.',
        code: code || 'LLM_SELECTION_ERROR',
        canRetry: true,
      };
    }

    if (httpStatus === 500 || raw.includes('500')) {
      return {
        title: 'Server Error',
        message:
          'The analysis service encountered an internal error. This is usually temporary — please try again.',
        code: code || 'SERVER_ERROR',
        canRetry: true,
      };
    }

    if (
      httpStatus === 503 ||
      raw.includes('503') ||
      raw.toLowerCase().includes('unavailable')
    ) {
      return {
        title: 'Service Unavailable',
        message:
          'The analysis service is temporarily unavailable. Please try again in a few moments.',
        code: code || 'SERVICE_UNAVAILABLE',
        canRetry: true,
      };
    }

    if (
      httpStatus === 429 ||
      raw.toLowerCase().includes('rate limit') ||
      raw.toLowerCase().includes('too many')
    ) {
      return {
        title: 'Rate Limited',
        message:
          'Too many requests — please wait a moment before sending another query.',
        code: code || 'RATE_LIMITED',
        canRetry: true,
      };
    }

    if (
      httpStatus === 401 ||
      httpStatus === 403 ||
      raw.toLowerCase().includes('unauthorized') ||
      raw.toLowerCase().includes('forbidden')
    ) {
      return {
        title: 'Authentication Error',
        message:
          'Your session may have expired. Please refresh the page and sign in again.',
        code: code || 'AUTH_ERROR',
        canRetry: false,
      };
    }

    if (
      httpStatus === 408 ||
      raw.toLowerCase().includes('timeout') ||
      raw.toLowerCase().includes('timed out')
    ) {
      return {
        title: 'Request Timed Out',
        message:
          'The analysis took too long to complete. Try simplifying your query or uploading a smaller dataset.',
        code: code || 'TIMEOUT',
        canRetry: true,
      };
    }

    if (
      raw.toLowerCase().includes('connection') ||
      raw.toLowerCase().includes('network')
    ) {
      return {
        title: 'Connection Lost',
        message:
          'Lost connection to the server. Check your internet connection and try again.',
        code: code || 'CONNECTION_ERROR',
        canRetry: true,
      };
    }

    return {
      title: 'Something Went Wrong',
      message:
        raw || 'An unexpected error occurred while processing your request.',
      code: code || undefined,
      canRetry: true,
    };
  }

  private parseAuthors(raw: any): string[] | undefined {
    if (!raw) return undefined;
    if (Array.isArray(raw))
      return raw.map((a) => String(a)).filter((a) => !!a.trim());
    if (typeof raw === 'string' && raw.trim()) {
      return raw
        .split(/[,;]/)
        .map((a) => a.trim())
        .filter((a) => !!a);
    }
    return undefined;
  }

  private normalizeDoi(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return (
      raw
        .replace(/^https?:\/\/doi\.org\//i, '')
        .replace(/^doi:/i, '')
        .trim() || undefined
    );
  }

  setSelectedSpecializedMode(m: { id: string; name: string } | null) {
    if (m) this.setActiveSpecializedMode(m);
    else this.clearActiveModeToDefault();
  }

  getSelectedSpecializedMode() {
    return this.selectedSpecializedModeSubject.value;
  }

  clearSelectedSpecializedMode() {
    this.clearActiveModeToDefault();
  }

  private readAutosaveSetting(): boolean {
    try {
      return localStorage.getItem('autosaveEnabled') === 'true';
    } catch {
      return false;
    }
  }

  setAutosaveEnabled(enabled: boolean): void {
    this.autosaveEnabledSubject.next(enabled);
  }

  markConversationSaved(sessionId: string): void {
    const conv = this.getConversationById(sessionId);
    if (!conv) return;

    conv.isDraft = false;
    conv.timestamp = new Date();

    this.emit();
  }

  resetAll(): void {
    this.conversations = [];
    this.pendingBySession.clear();
    this.activeConversationId = null;
    this.conversationsSubject.next([]);
    this.selectedSpecializedModeSubject.next(null);
    this.activeModeSubject.next({ kind: 'quick', mode: 'creative_media' });
  }

  updateConversationProjectId(
    conversationId: string,
    projectId: string | null,
  ): void {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.projectId = projectId;
      this.emit();
    }
  }

  clearProjectFromConversations(projectId: string): void {
    let changed = false;
    for (const conv of this.conversations) {
      if (conv.projectId === projectId) {
        conv.projectId = null;
        changed = true;
      }
    }
    if (changed) this.emit();
  }
}
