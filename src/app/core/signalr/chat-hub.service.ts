import { Injectable, inject, NgZone } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LlmSelectionService } from '../ai/llm-selection.service';
import { ReviewerParamsService } from '../ai/reviewer-params.service';
import { LlmSelection } from '../../constants/llm-models.constants';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ChatHubService {
  private auth = inject(AuthService);
  private zone = inject(NgZone);
  private llm = inject(LlmSelectionService);
  private reviewerParams = inject(ReviewerParamsService);

  private hubConnection: signalR.HubConnection | null = null;
  private sessionId: string | null = null;

  private connectedSubject = new BehaviorSubject<boolean>(false);
  private chunkSubject = new Subject<any>();
  private completedSubject = new Subject<any>();
  private errorSubject = new Subject<any>();
  private sessionCreatedSubject = new Subject<{ sessionId: string }>();

  get connected$(): Observable<boolean> {
    return this.connectedSubject.asObservable();
  }

  get chunk$(): Observable<any> {
    return this.chunkSubject.asObservable();
  }

  get completed$(): Observable<any> {
    return this.completedSubject.asObservable();
  }

  get error$(): Observable<any> {
    return this.errorSubject.asObservable();
  }

  get sessionCreated$(): Observable<{ sessionId: string }> {
    return this.sessionCreatedSubject.asObservable();
  }

  async connect(): Promise<void> {
    if (
      this.hubConnection &&
      this.hubConnection.state === signalR.HubConnectionState.Connected
    ) {
      return;
    }

    const tokenFactory = async () => await this.auth.getValidAccessToken();

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(environment.signalRBaseUrl, {
        accessTokenFactory: tokenFactory,
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.hubConnection.on('SessionCreated', (dto: any) => {
      const sid = dto?.sessionId ?? dto?.SessionId;
      if (sid) {
        this.sessionId = sid;
        this.zone.run(() => this.sessionCreatedSubject.next({ sessionId: sid }));
      }
    });

    this.hubConnection.on('AssistantChunk', (dto) => {
      this.zone.run(() => this.chunkSubject.next({ ...dto, _source: 'assistant' }));
    });

    this.hubConnection.on('AssistantStreamCompleted', (dto) => {
      this.zone.run(() => this.completedSubject.next(dto));
    });

    this.hubConnection.on('AssistantStreamError', (err) => {
      this.zone.run(() => this.errorSubject.next(err));
    });

    this.hubConnection.on('RagAssistantChunk', (dto) => {
      this.zone.run(() => this.chunkSubject.next({ ...dto, _source: 'rag' }));
    });

    this.hubConnection.on('RagAssistantStreamCompleted', (dto) => {
      this.zone.run(() => this.completedSubject.next(dto));
    });

    this.hubConnection.on('RagAssistantStreamError', (err) => {
      this.zone.run(() => this.errorSubject.next(err));
    });

    this.hubConnection.on('ReviewerAssistantChunk', (dto) => {
      this.zone.run(() => this.chunkSubject.next({ ...dto, _source: 'reviewer' }));
    });

    this.hubConnection.on('ReviewerAssistantStreamCompleted', (dto) => {
      this.zone.run(() => this.completedSubject.next(dto));
    });

    this.hubConnection.on('ReviewerAssistantStreamError', (err) => {
      this.zone.run(() => this.errorSubject.next(err));
    });

    this.hubConnection.onclose(() => {
      this.zone.run(() => this.connectedSubject.next(false));
    });

    this.hubConnection.onreconnected(() => {
      this.zone.run(() => this.connectedSubject.next(true));

      if (this.sessionId) {
        this.joinSession(this.sessionId).catch(() => {});
      }
    });

    try {
      await this.hubConnection.start();
      this.zone.run(() => this.connectedSubject.next(true));
    } catch (err: any) {

      const is401 = err?.statusCode === 401 ||
        err?.message?.includes('401') ||
        err?.message?.includes('Unauthorized');
      if (is401) {
        this.hubConnection = null;
        try {
          await this.connect();
          return;
        } catch (retryErr) {
          this.zone.run(() => {
            this.connectedSubject.next(false);
            this.errorSubject.next(retryErr);
          });
          throw retryErr;
        }
      }
      this.zone.run(() => {
        this.connectedSubject.next(false);
        this.errorSubject.next(err);
      });
      throw err;
    }
  }

  resetSession(): void {
    this.sessionId = null;
  }


  async streamAssistantMessage(
    message: string,
    sessionId?: string | null,
    attachmentFileIds: string[] | null = null,
    llmSelection?: LlmSelection
  ): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed) return Promise.reject('Empty message');

    if (!this.hubConnection) await this.connect();

    const active = sessionId ?? this.sessionId ?? null;

    const req: Record<string, any> = {
      sessionId: active,
      message: trimmed,
      asyncExecution: true,
      llm_selection: llmSelection ?? this.llm.selectionPayload(),
    };

    if (attachmentFileIds?.length) {
      req['attachmentFileIds'] = attachmentFileIds;
    }

    await this.hubConnection!.invoke('StreamAssistant', req);

    if (active) {
      this.sessionId = active;
    }
  }

  async streamRagAssistantMessage(
    message: string,
    sessionId?: string | null,
    attachmentFileIds: string[] | null = null
  ): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed) return Promise.reject('Empty message');

    if (!this.hubConnection) await this.connect();

    const active = sessionId ?? this.sessionId ?? null;

    const req: Record<string, any> = {
      sessionId: active,
      message: trimmed,
      asyncExecution: true,
      llm_selection: this.llm.selectionPayload(),
    };

    if (attachmentFileIds?.length) {
      req['attachmentFileIds'] = attachmentFileIds;
    }

    await this.hubConnection!.invoke('StreamRagAssistant', req);

    if (active) {
      this.sessionId = active;
    }
  }

  async streamReviewerAssistantMessage(
    message: string,
    sessionId?: string | null,
    attachmentFileIds: string[] | null = null,
    feedback?: string | null
  ): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed) return Promise.reject('Empty message');

    if (!this.hubConnection) await this.connect();

    const active = sessionId ?? this.sessionId ?? null;

    const req: Record<string, any> = {
      sessionId: active,
      message: trimmed,
      asyncExecution: true,
      llm_selection: this.llm.selectionPayload(),
    };

    if (attachmentFileIds?.length) {
      req['attachmentFileIds'] = attachmentFileIds;
    }

    if (feedback?.trim()) {
      req['feedback'] = feedback.trim();
    }

    req['reviewParameters'] = this.reviewerParams.payload();

    await this.hubConnection!.invoke('StreamReviewerAssistant', req);

    if (active) {
      this.sessionId = active;
    }
  }

  async joinSession(sessionId: string): Promise<void> {
    if (!this.hubConnection ||
        this.hubConnection.state !== signalR.HubConnectionState.Connected) {
      await this.waitForConnection();
    }

    await this.hubConnection!.invoke('JoinSession', sessionId);
    this.sessionId = sessionId;
  }

  private waitForConnection(timeoutMs = 10000): Promise<void> {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.unsubscribe();
        reject(new Error('Timed out waiting for SignalR connection'));
      }, timeoutMs);

      const sub = this.connectedSubject.subscribe(connected => {
        if (connected) {
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve();
        }
      });

      if (!this.hubConnection ||
          this.hubConnection.state === signalR.HubConnectionState.Disconnected) {
        this.connect().catch(reject);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.stop();
      this.hubConnection = null;
      this.sessionId = null;
      this.zone.run(() => this.connectedSubject.next(false));
    }
  }
}
