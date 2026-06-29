import { memo, type RefObject, type UIEvent } from "react";
import type { ChatAttachment, ChatMessage } from "@/types/domain";
import { AssistantMessage } from "./AssistantMessage";
import { UserMessage } from "./UserMessage";

/** Props for the scrollable message timeline area. */
type MessageTimelineProps = {
  /** Stable memo context for message action buttons. */
  actionContext: object;
  /** Whether message actions should be disabled while a request is active. */
  busy: boolean;
  /** Resolves an encrypted attachment into a previewable data URL. */
  loadAttachmentPreview: (attachment: ChatAttachment) => Promise<string>;
  /** Whether the conversation list is still loading. */
  loadingConversations: boolean;
  /** Whether the active conversation messages are still loading. */
  loadingMessages: boolean;
  /** Messages displayed in chronological order. */
  messages: ChatMessage[];
  /** Scroll container ref used by the viewport hook. */
  messagesRef: RefObject<HTMLDivElement | null>;
  /** Permanently deletes a user turn and its paired response. */
  onDeleteUserTurn: (message: ChatMessage) => Promise<void>;
  /** Tracks whether the user is near the bottom for auto-scroll behavior. */
  onMessagesScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** Retries a user turn after replacing the original turn. */
  onRetryUserTurn: (message: ChatMessage) => Promise<void>;
  /** Creates a share link for a user/assistant turn. */
  onShareMessageTurn: (message: ChatMessage) => Promise<void>;
};

/** Displays loading, empty state, and rendered chat messages in the main panel. */
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
);
