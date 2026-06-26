import type { ChatMessage } from "@/types/domain";
import { textFromParts } from "@/lib/chatApi";
import { messageTurnPair } from "@/lib/chatMessageUtils";
import { copyShareUrl } from "@/lib/clipboard";
import { materializeMessagesForShare } from "@/lib/messageAttachmentMaterialization";
import {
  createConversationShare,
  createMessageTurnShare,
} from "@/lib/shares";
import type { UnlockedVault } from "@/lib/vault";

type UseMessageSharingOptions = {
  activeConversationTitle: string;
  busy: boolean;
  conversationId: string | null;
  messages: ChatMessage[];
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  vault: UnlockedVault;
};

export function useMessageSharing({
  activeConversationTitle,
  busy,
  conversationId,
  messages,
  onError,
  onNotice,
  vault,
}: UseMessageSharingOptions) {
  async function shareConversationSnapshot() {
    if (!conversationId || messages.length === 0 || busy) return;

    try {
      onError(null);
      onNotice(null);
      const shareMessages = await materializeMessagesForShare({
        conversationId,
        messages,
        vault,
      });
      const url = await createConversationShare({
        conversationId,
        messages: shareMessages,
        title: activeConversationTitle,
        vault,
      });
      await copyShareUrl(url);
      onNotice("Conversation share link copied.");
    } catch (unknownError) {
      onError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to share conversation.",
      );
    }
  }

  async function shareMessageTurn(message: ChatMessage) {
    if (!conversationId || busy) return;

    const turn = messageTurnPair(messages, message.id);
    if (!turn) {
      onError("A message can only be shared after its paired response is available.");
      return;
    }

    try {
      onError(null);
      onNotice(null);
      const shareMessages = await materializeMessagesForShare({
        conversationId,
        messages: [turn.userMessage, turn.assistantMessage],
        vault,
      });
      const url = await createMessageTurnShare({
        assistantMessageId: turn.assistantMessage.id,
        conversationId,
        messages: shareMessages,
        title: textFromParts(turn.userMessage.parts).trim() || "Shared message",
        userMessageId: turn.userMessage.id,
        vault,
      });
      await copyShareUrl(url);
      onNotice("Message share link copied.");
    } catch (unknownError) {
      onError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to share message.",
      );
    }
  }

  return {
    shareConversationSnapshot,
    shareMessageTurn,
  };
}
