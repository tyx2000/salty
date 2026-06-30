import type {
  ChatAttachment,
  ChatMessage,
  ChatResponseStats,
  ProviderId,
  ProviderKeyState,
} from "@/types/domain";
import type { PendingAttachment } from "@/lib/messages";
import {
  resolveProviderApiKey,
  validateTurnAttachments,
} from "@/lib/providerValidation";

type ResolveTurnConfigOptions = {
  model: string;
  pendingAttachments: PendingAttachment[];
  provider: ProviderId;
  providerKeys: Record<ProviderId, ProviderKeyState>;
  reusedAttachments: ChatAttachment[];
};

export function resolveTurnConfig({
  model,
  pendingAttachments,
  provider,
  providerKeys,
  reusedAttachments,
}: ResolveTurnConfigOptions):
  | { ok: true; apiKey: string; model: string }
  | { ok: false; error: string; openProviderSettings: boolean } {
  const providerKey = resolveProviderApiKey({
    model,
    provider,
    providerKeys,
  });
  if (!providerKey.ok) {
    return {
      ok: false,
      error: providerKey.error,
      openProviderSettings: true,
    };
  }

  const attachmentError = validateTurnAttachments({
    model: providerKey.model,
    pendingAttachments,
    provider,
    reusedAttachments,
  });
  if (attachmentError) {
    return {
      ok: false,
      error: attachmentError,
      openProviderSettings: false,
    };
  }

  return {
    ok: true,
    apiKey: providerKey.apiKey,
    model: providerKey.model,
  };
}

export function buildCurrentRequestMessage(
  completedUserMessage: ChatMessage,
  requestAttachmentMap: Record<string, ChatAttachment>,
) {
  return {
    ...completedUserMessage,
    attachments: {
      ...completedUserMessage.attachments,
      ...requestAttachmentMap,
    },
  };
}

export function createCompletedAssistantMessage({
  assistantMessage,
  assistantText,
  responseStats,
  wasAborted,
}: {
  assistantMessage: ChatMessage;
  assistantText: string;
  responseStats: ChatResponseStats;
  wasAborted: boolean;
}): ChatMessage {
  return {
    ...assistantMessage,
    status: wasAborted ? "cancelled" : "completed",
    parts: [{ type: "markdown", text: assistantText }],
    responseStats,
  };
}
