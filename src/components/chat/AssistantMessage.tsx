import { memo } from "react";
import { Share2 } from "lucide-react";
import type { ChatAttachment, ChatMessage } from "@/types/domain";
import {
  formatResponseStats,
  messageHasRenderableParts,
} from "./messageDisplay";
import { MessageContent } from "./MessageContent";

type AssistantMessageProps = {
  actionContext: object;
  busy: boolean;
  loadAttachmentPreview: (attachment: ChatAttachment) => Promise<string>;
  message: ChatMessage;
  onShareMessageTurn: (message: ChatMessage) => Promise<void>;
};

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
