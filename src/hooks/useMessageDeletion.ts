import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage } from "@/types/domain";
import type { ConversationListItem } from "@/lib/conversations";
import { refreshConversationLastMessageAt } from "@/lib/conversations";
import { deleteMessages } from "@/lib/messages";
import { userTurnMessageIds } from "@/lib/chatMessageUtils";
import type { UnlockedVault } from "@/lib/vault";

/** Options for deleting one user turn and its paired assistant response. */
type UseMessageDeletionOptions = {
  /** Prevents deletion while a request is in flight. */
  busy: boolean;
  /** Active conversation id; null means only local pending messages can be removed. */
  conversationId: string | null;
  /** Current ordered message list used to find paired turn ids. */
  messages: ChatMessage[];
  /** Receives delete failures for display. */
  onError: (message: string | null) => void;
  /** Updates the sidebar timestamp after successful deletion. */
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>;
  /** Removes deleted messages from the active timeline. */
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  /** Unlocked encryption vault used for database deletion. */
  vault: UnlockedVault;
};

/** Provides true deletion for a user message and its corresponding response. */
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
