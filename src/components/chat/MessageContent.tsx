import type { ChatAttachment, ChatMessage } from "@/types/domain";
import { MessagePartRenderer } from "@/components/MessagePartRenderer";
import {
  messageHasAttachmentsAndBody,
  orderedMessageParts,
} from "./messageDisplay";

/** Props for rendering the ordered parts inside one chat message. */
type MessageContentProps = {
  /** Converts an encrypted attachment to a data URL when an attachment part renders. */
  loadAttachmentPreview: (attachment: ChatAttachment) => Promise<string>;
  /** Message whose text, markdown, file, and image parts should be displayed. */
  message: ChatMessage;
};

/** Displays a message body with attachments ordered before/around text as needed. */
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
