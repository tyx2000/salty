import type {
  ChatAttachment,
  ChatMessage,
  MessagePart,
  ProviderId,
} from "@/types/domain";
import type { PendingAttachment } from "@/lib/messages";
import { fileToDataUrl } from "@/lib/fileDataUrl";

type CreateChatTurnDraftOptions = {
  parts: MessagePart[];
  pendingAttachments: PendingAttachment[];
  provider: ProviderId;
  reusedAttachments: ChatAttachment[];
  model: string;
};

export async function createChatTurnDraft({
  parts,
  pendingAttachments,
  provider,
  reusedAttachments,
  model,
}: CreateChatTurnDraftOptions) {
  const pendingAttachmentMap = Object.fromEntries(
    await Promise.all(
      pendingAttachments.map(async (attachment) => [
        attachment.id,
        {
          id: attachment.id,
          fileName: attachment.file.name,
          mimeType: attachment.file.type || "application/octet-stream",
          sizeBytes: attachment.file.size,
          dataUrl: await fileToDataUrl(attachment.file),
        },
      ]),
    ),
  ) as Record<string, ChatAttachment>;
  const reusedAttachmentMap = Object.fromEntries(
    reusedAttachments.map((attachment) => [attachment.id, attachment]),
  );
  const requestAttachmentMap = {
    ...reusedAttachmentMap,
    ...pendingAttachmentMap,
  };
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    status: "pending",
    provider,
    model,
    parts,
    attachments: requestAttachmentMap,
    createdAt: new Date().toISOString(),
  };
  const completedUserMessage: ChatMessage = {
    ...userMessage,
    status: "completed",
  };
  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    status: "streaming",
    provider,
    model,
    parts: [{ type: "markdown", text: "" }],
    createdAt: new Date().toISOString(),
  };

  return {
    assistantMessage,
    completedUserMessage,
    requestAttachmentMap,
    userMessage,
  };
}
