import { memo } from "react";
import { Share2 } from "lucide-react";
import type { ChatAttachment, ChatMessage } from "@/types/domain";
import {
  formatResponseStats,
  messageHasRenderableParts,
} from "./messageDisplay";
import { MessageContent } from "./MessageContent";

/** Props for a rendered assistant response and response metadata. */
type AssistantMessageProps = {
  /** Stable memo context for action button availability. */
  actionContext: object;
  /** Whether action buttons should be disabled while a request is active. */
  busy: boolean;
  /** Resolves encrypted attachments for inline previews. */
  loadAttachmentPreview: (attachment: ChatAttachment) => Promise<string>;
  /** Assistant message to render. */
  message: ChatMessage;
  /** Creates a share link for this response and its paired user message. */
  onShareMessageTurn: (message: ChatMessage) => Promise<void>;
};

/** Displays an assistant message, thinking state, share action, and persisted stats. */
export const AssistantMessage = memo(
  function AssistantMessage({
    busy,
    loadAttachmentPreview,
    message,
    onShareMessageTurn,
  }: AssistantMessageProps) {
    return (
      <article className="message assistant">
        <span>{message.role}</span>
        {messageHasRenderableParts(message) ? (
          <MessageContent
            loadAttachmentPreview={loadAttachmentPreview}
            message={message}
          />
        ) : message.status === "pending" || message.status === "streaming" ? (
          <div className="thinking-indicator" aria-label="Thinking">
            Thinking
          </div>
        ) : null}
        <div className="assistant-message-meta">
          <button
            aria-label="Share message and response"
            disabled={busy}
            onClick={() => {
              void onShareMessageTurn(message);
            }}
            title="Share message and response"
            type="button"
          >
            <Share2 size={14} />
          </button>
          {message.responseStats ? (
            <div className="message-stats">
              {formatResponseStats(message.responseStats)}
            </div>
          ) : null}
        </div>
      </article>
    );
  },
  (previous, next) =>
    previous.actionContext === next.actionContext &&
    previous.busy === next.busy &&
    previous.loadAttachmentPreview === next.loadAttachmentPreview &&
    previous.message === next.message,
);
