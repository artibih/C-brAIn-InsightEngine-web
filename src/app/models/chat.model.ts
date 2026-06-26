export type ChatRole = 'user' | 'assistant' | (string & {});

export interface ChatSessionItemDto {
  id: string;
  title: string;
  createdAt: string;
  lastActivityAt?: string;
  firstMessagePreview?: string;
  messageCount?: number;
  projectId?: string | null;
  mode?: string | null;
}
export interface ChatMessageDto {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: ChatAttachmentDto[];
  userId?: string | null;
  rating?: number | null;
  feedbackComment?: string | null;
}

export interface MessageFeedbackRequest {
  rating: number;
  feedbackComment?: string;
}
export interface ConversationDto {
  sessionId: string;
  title: string;
  createdAt: string;
  messages: ChatMessageDto[];
}
export interface ChatAttachmentDto {
  fileId: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  thumbnailDataUrl?: string;
  [key: string]: unknown;
}
