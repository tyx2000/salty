import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage } from "@/types/domain";
import type { ConversationListItem } from "@/lib/conversations";
import { refreshConversationLastMessageAt } from "@/lib/conversations";
import { deleteMessages } from "@/lib/messages";
import { userTurnMessageIds } from "@/lib/chatMessageUtils";
import type { UnlockedVault } from "@/lib/vault";

type UseMessageDeletionOptions = {
  busy: boolean;
  conversationId: string | null;
  messages: ChatMessage[];
  onError: (message: string | null) => void;
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  vault: UnlockedVault;
};

export function useMessageDeletion({
  busy,
  conversationId,
  messages,
  onError,
  setConversations,
  setMessages,
  vault,
}: UseMessageDeletionOptions) {
  async function deleteUserTurn(userMessage: ChatMessage) {
    if (busy) return;

    const turnMessageIds = userTurnMessageIds(messages, userMessage.id);
    if (turnMessageIds.length === 0) return;

    if (!conversationId) {
      setMessages((current) =>
        current.filter((message) => !turnMessageIds.includes(message.id)),
      );
      return;
    }

    try {
      onError(null);
      await deleteMessages(vault, turnMessageIds);
      const nextMessages = messages.filter(
        (message) => !turnMessageIds.includes(message.id),
      );
      setMessages(nextMessages);
      await refreshConversationLastMessageAt(conversationId);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, updatedAt: new Date().toISOString() }
            : conversation,
        ),
      );
    } catch (unknownError) {
      onError(
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to delete message.",
      );
    }
  }

  return { deleteUserTurn };
}
