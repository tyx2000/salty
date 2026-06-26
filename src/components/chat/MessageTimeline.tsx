import { memo, type RefObject, type UIEvent } from "react";
import type { ChatAttachment, ChatMessage } from "@/types/domain";
import { AssistantMessage } from "./AssistantMessage";
import { UserMessage } from "./UserMessage";

type MessageTimelineProps = {
  actionContext: object;
  busy: boolean;
  loadAttachmentPreview: (attachment: ChatAttachment) => Promise<string>;
  loadingConversations: boolean;
  loadingMessages: boolean;
  messages: ChatMessage[];
  messagesRef: RefObject<HTMLDivElement | null>;
  onDeleteUserTurn: (message: ChatMessage) => Promise<void>;
  onMessagesScroll: (event: UIEvent<HTMLDivElement>) => void;
  onRetryUserTurn: (message: ChatMessage) => Promise<void>;
  onShareMessageTurn: (message: ChatMessage) => Promise<void>;
};

export const MessageTimeline = memo(
  function MessageTimeline({
    actionContext,
    busy,
    loadAttachmentPreview,
    loadingConversations,
    loadingMessages,
    messages,
    messagesRef,
    onDeleteUserTurn,
    onMessagesScroll,
    onRetryUserTurn,
    onShareMessageTurn,
  }: MessageTimelineProps) {
    return (
      <div
        className="messages"
        aria-live="polite"
        onScroll={onMessagesScroll}
        ref={messagesRef}
      >
        {loadingConversations || loadingMessages ? (
          <div className="empty-state">
            <h1 className="loading-shimmer-text">Loading conversation</h1>
            <p className="loading-shimmer-text">Decrypting messages in this browser.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <h1>Start a conversation</h1>
            <p>
              Configure and test a provider key in Settings. Available models
              will appear below the input.
            </p>
          </div>
        ) : (
          messages.map((message) =>
            message.role === "assistant" ? (
              <AssistantMessage
                actionContext={actionContext}
                busy={busy}
                key={message.id}
                loadAttachmentPreview={loadAttachmentPreview}
                message={message}
                onShareMessageTurn={onShareMessageTurn}
              />
            ) : (
              <UserMessage
                actionContext={actionContext}
                busy={busy}
                key={message.id}
                loadAttachmentPreview={loadAttachmentPreview}
                message={message}
                onDeleteUserTurn={onDeleteUserTurn}
                onRetryUserTurn={onRetryUserTurn}
                onShareMessageTurn={onShareMessageTurn}
              />
            ),
          )
        )}
      </div>
    );
  },
  (previous, next) =>
    previous.actionContext === next.actionContext &&
    previous.busy === next.busy &&
    previous.loadAttachmentPreview === next.loadAttachmentPreview &&
    previous.loadingConversations === next.loadingConversations &&
    previous.loadingMessages === next.loadingMessages &&
    previous.messages === next.messages &&
    previous.messagesRef === next.messagesRef &&
    previous.onMessagesScroll === next.onMessagesScroll,
);
