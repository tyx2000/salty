import type { ChatAttachment, ChatMessage } from "@/types/domain";
import { MessagePartRenderer } from "@/components/MessagePartRenderer";
import {
  messageHasAttachmentsAndBody,
  orderedMessageParts,
} from "./messageDisplay";

type MessageContentProps = {
  loadAttachmentPreview: (attachment: ChatAttachment) => Promise<string>;
  message: ChatMessage;
};

export function MessageContent({
  loadAttachmentPreview,
  message,
}: MessageContentProps) {
  return (
    <div
      className={
        messageHasAttachmentsAndBody(message.parts)
          ? "message-content with-divider"
          : "message-content"
      }
    >
      {orderedMessageParts(message.parts).map((part, index) => (
        <MessagePartRenderer
          attachments={message.attachments}
          key={`${message.id}:${index}`}
          loadAttachmentPreview={loadAttachmentPreview}
          part={part}
        />
      ))}
    </div>
  );
}
