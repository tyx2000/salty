import type {
  ChatAttachment,
  ChatMessage,
  MessagePart,
} from "@/types/domain";
import {
  encryptedAttachmentToDataUrl,
  type PendingAttachment,
} from "@/lib/messages";
import type { UnlockedVault } from "@/lib/vault";
import { attachmentIdsFromParts } from "@/lib/chatMessageUtils";
import { dataUrlToFile } from "@/lib/fileDataUrl";

export async function materializeMessagesForShare({
  conversationId,
  messages,
  vault,
}: {
  conversationId: string;
  messages: ChatMessage[];
  vault: UnlockedVault;
}) {
  return Promise.all(
    messages.map(async (message) => {
      const attachmentEntries = await Promise.all(
        attachmentIdsFromParts(message.parts).map(async (attachmentId) => {
          const attachment = message.attachments?.[attachmentId];
          if (!attachment) {
            throw new Error("Message attachment metadata is missing.");
          }

          return [
            attachmentId,
            {
              ...attachment,
              dataUrl:
                attachment.dataUrl ??
                (await encryptedAttachmentToDataUrl(
                  vault,
                  conversationId,
                  attachment,
                )),
            },
          ] as const;
        }),
      );

      return {
        ...message,
        attachments:
          attachmentEntries.length > 0
            ? Object.fromEntries(attachmentEntries)
            : undefined,
      } satisfies ChatMessage;
    }),
  );
}

export async function retryAttachmentsFromMessage({
  conversationId,
  userMessage,
  vault,
}: {
  conversationId: string | null;
  userMessage: ChatMessage;
  vault: UnlockedVault;
}) {
  const attachmentParts = userMessage.parts.filter(
    (part): part is Extract<MessagePart, { type: "image" | "file" }> =>
      part.type === "image" || part.type === "file",
  );

  const attachments = await Promise.all(
    attachmentParts.map(async (part) => {
      const attachment = userMessage.attachments?.[part.attachmentId];
      if (!attachment) throw new Error("Message attachment metadata is missing.");

      let dataUrl = attachment.dataUrl;
      if (!dataUrl) {
        if (!conversationId) throw new Error("Conversation is not ready.");
        dataUrl = await encryptedAttachmentToDataUrl(
          vault,
          conversationId,
          attachment,
        );
      }

      if (!attachment.storagePath) {
        return {
          kind: "pending" as const,
          attachment: {
            id: attachment.id,
            file: await dataUrlToFile(
              dataUrl,
              attachment.fileName,
              attachment.mimeType,
            ),
            type: part.type,
          } satisfies PendingAttachment,
        };
      }

      return {
        kind: "reused" as const,
        attachment: {
          ...attachment,
          dataUrl,
        } satisfies ChatAttachment,
      };
    }),
  );

  return {
    pendingAttachments: attachments.flatMap((entry) =>
      entry.kind === "pending" ? [entry.attachment] : [],
    ),
    reusedAttachments: attachments.flatMap((entry) =>
      entry.kind === "reused" ? [entry.attachment] : [],
    ),
  };
}
