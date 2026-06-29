import type { ChatMessage, ProviderId, ProviderKeyState } from "@/types/domain";
import { refreshConversationLastMessageAt } from "@/lib/conversations";
import {
  deleteMessages,
  reassignAttachmentsToMessage,
} from "@/lib/messages";
import { textFromParts } from "@/lib/chatApi";
import {
  cloneMessageParts,
  userTurnMessageIds,
} from "@/lib/chatMessageUtils";
import { retryAttachmentsFromMessage } from "@/lib/messageAttachmentMaterialization";
import {
  resolveProviderApiKey,
  validateTurnAttachments,
} from "@/lib/providerValidation";
import type { UnlockedVault } from "@/lib/vault";
import type { SendUserTurnOptions } from "@/hooks/useSendUserTurn";

/** Options for retrying an existing user turn. */
type UseRetryUserTurnOptions = {
  /** Acquires the shared send lock before preparing retry attachments. */
  acquireBusyLock: () => boolean;
  /** Synchronous busy flag used to block duplicate retry clicks. */
  busyRef: { current: boolean };
  /** Active conversation id that owns the retried turn. */
  conversationId: string | null;
  /** Fallback model when the original user message has no model metadata. */
  defaultModel: string;
  /** Fallback provider when the original user message has no provider metadata. */
  defaultProvider: ProviderId;
  /** Current ordered message list used to remove the old turn from history. */
  messages: ChatMessage[];
  /** Receives retry failures for display. */
  onError: (message: string | null) => void;
  /** Opens provider settings when retry cannot resolve an API key. */
  onOpenProviderSettings: () => void;
  /** Tested provider keys and model lists used to resolve retry credentials. */
  providerKeys: Record<ProviderId, ProviderKeyState>;
  /** Releases the shared send lock when retry setup fails. */
  releaseBusyLock: () => void;
  /** Sends the replacement turn after retry setup succeeds. */
  sendUserTurn: (options: SendUserTurnOptions) => Promise<void>;
  /** Unlocked encryption vault used for attachment materialization and deletion. */
  vault: UnlockedVault;
};

/**
 * Re-sends a previous user message, reusing attachment links, then permanently
 * deletes the old user/assistant turn only after the replacement response saves.
 */
export function useRetryUserTurn({
  acquireBusyLock,
  busyRef,
  conversationId,
  defaultModel,
  defaultProvider,
  messages,
  onError,
  onOpenProviderSettings,
  providerKeys,
  releaseBusyLock,
  sendUserTurn,
  vault,
}: UseRetryUserTurnOptions) {
  async function retryUserTurn(userMessage: ChatMessage) {
    if (busyRef.current) return;

    const turnMessageIds = userTurnMessageIds(messages, userMessage.id);
    if (turnMessageIds.length === 0) return;
    const retryConversationId = conversationId;

    try {
      onError(null);
      const turnProvider = userMessage.provider ?? defaultProvider;
      const turnModel = userMessage.model ?? defaultModel;
      const providerKey = resolveProviderApiKey({
        model: turnModel,
        provider: turnProvider,
        providerKeys,
      });
      if (!providerKey.ok) {
        onError(providerKey.error);
        onOpenProviderSettings();
        return;
      }
      const resolvedTurnModel = providerKey.model;

      if (!acquireBusyLock()) return;
      const retryAttachments = await retryAttachmentsFromMessage({
        conversationId: retryConversationId,
        userMessage,
        vault,
      });
      const attachmentError = validateTurnAttachments({
        model: resolvedTurnModel,
        pendingAttachments: retryAttachments.pendingAttachments,
        provider: turnProvider,
        reusedAttachments: retryAttachments.reusedAttachments,
      });
      if (attachmentError) {
        releaseBusyLock();
        onError(attachmentError);
        return;
      }

      const retryHistory = messages.filter(
        (message) => !turnMessageIds.includes(message.id),
      );
      const reusedAttachmentIds = retryAttachments.reusedAttachments.map(
        (attachment) => attachment.id,
      );
      await sendUserTurn({
        parts: cloneMessageParts(userMessage.parts),
        pendingAttachments: retryAttachments.pendingAttachments,
        reusedAttachments: retryAttachments.reusedAttachments,
        title: textFromParts(userMessage.parts).trim() || "Retried message",
        historyMessages: retryHistory,
        turnProvider,
        turnModel: resolvedTurnModel,
        afterTurnSaved: retryConversationId
          ? async (newUserMessage) => {
              await reassignAttachmentsToMessage(
                vault,
                retryConversationId,
                newUserMessage.id,
                reusedAttachmentIds,
              );
              await deleteMessages(vault, turnMessageIds);
              await refreshConversationLastMessageAt(retryConversationId);
            }
          : undefined,
        busyLockAcquired: true,
      });
    } catch (unknownError) {
      if (busyRef.current) releaseBusyLock();
      onError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to retry message.",
      );
    }
  }

  return { retryUserTurn };
}
