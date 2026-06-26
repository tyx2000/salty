import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage } from "@/types/domain";
import type { ConversationListItem } from "@/lib/conversations";
import { deleteConversation } from "@/lib/conversations";
import { deleteMessages, updateMessageStatus } from "@/lib/messages";
import { safeTouchConversation } from "@/lib/messageSettlement";
import type { UnlockedVault } from "@/lib/vault";

type RollbackFailedTurnOptions = {
  assistantContentPersisted: boolean;
  assistantMessage: ChatMessage;
  assistantPersisted: boolean;
  conversationId: string | null;
  createdConversationId: string | null;
  navigateHome: () => void;
  setConversationId: Dispatch<SetStateAction<string | null>>;
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  userMessage: ChatMessage;
  userPersisted: boolean;
  vault: UnlockedVault;
};

export async function rollbackFailedTurn({
  assistantContentPersisted,
  assistantMessage,
  assistantPersisted,
  conversationId,
  createdConversationId,
  navigateHome,
  setConversationId,
  setConversations,
  setMessages,
  userMessage,
  userPersisted,
  vault,
}: RollbackFailedTurnOptions) {
  if (!assistantContentPersisted) {
    await updateMessageStatus(userMessage.id, "failed").catch(() => undefined);
  }
  if (assistantPersisted && !assistantContentPersisted) {
    await deleteMessages(vault, [assistantMessage.id]).catch(() => undefined);
  }
  if (createdConversationId && !userPersisted) {
    await deleteConversation(vault, createdConversationId).catch(() => undefined);
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== createdConversationId),
    );
    setConversationId(null);
    navigateHome();
  } else if (createdConversationId || conversationId) {
    await safeTouchConversation(createdConversationId ?? conversationId!);
  }
  setMessages((current) =>
    current
      .filter((message) => message.id !== assistantMessage.id)
      .map((message) =>
        message.id === userMessage.id && !assistantContentPersisted
          ? {
              ...message,
              status: "failed" as const,
            }
          : message,
      ),
  );
}
