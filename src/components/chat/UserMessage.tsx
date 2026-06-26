import { memo } from "react";
import { CircleAlert, RotateCcw, Share2, Trash2 } from "lucide-react";
import type { ChatAttachment, ChatMessage } from "@/types/domain";
import { MessageContent } from "./MessageContent";

type UserMessageProps = {
  actionContext: object;
  busy: boolean;
  loadAttachmentPreview: (attachment: ChatAttachment) => Promise<string>;
  message: ChatMessage;
  onDeleteUserTurn: (message: ChatMessage) => Promise<void>;
  onRetryUserTurn: (message: ChatMessage) => Promise<void>;
  onShareMessageTurn: (message: ChatMessage) => Promise<void>;
};

export const UserMessage = memo(
  function UserMessage({
    busy,
    loadAttachmentPreview,
    message,
    onDeleteUserTurn,
    onRetryUserTurn,
    onShareMessageTurn,
  }: UserMessageProps) {
    return (
      <article className="message user">
        <span>{message.role}</span>
        <div className="user-message-row">
          {message.status === "failed" ? (
            <div className="message-failure-icon" aria-label="Send failed">
              <CircleAlert size={15} />
            </div>
          ) : null}
          <MessageContent
            loadAttachmentPreview={loadAttachmentPreview}
            message={message}
          />
        </div>
        <div className="message-actions">
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
          <button
            aria-label={
              message.status === "pending" ? "Sending message" : "Retry message"
            }
            disabled={busy}
            onClick={() => {
              void onRetryUserTurn(message);
            }}
            title={message.status === "pending" ? "Sending" : "Retry"}
            type="button"
          >
            <RotateCcw
              className={message.status === "pending" ? "spin" : undefined}
              size={14}
            />
          </button>
          <button
            aria-label="Delete message"
            disabled={busy}
            onClick={() => {
              void onDeleteUserTurn(message);
            }}
            title="Delete"
            type="button"
          >
            <Trash2 size={14} />
          </button>
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
