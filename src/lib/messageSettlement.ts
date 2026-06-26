import type { ChatMessage } from "@/types/domain";
import {
  deleteMessages,
  updateMessageStatus,
} from "@/lib/messages";
import {
  refreshConversationLastMessageAt,
  touchConversation,
} from "@/lib/conversations";
import type { UnlockedVault } from "@/lib/vault";
import { messageHasRenderableParts } from "@/components/chat/messageDisplay";

export async function safeTouchConversation(conversationId: string) {
  await touchConversation(conversationId).catch(() => undefined);
}

export async function settleInterruptedAssistantMessages(
  vault: Pick<UnlockedVault, "userId">,
  messages: ChatMessage[],
  conversationId: string,
) {
  const emptyInterruptedAssistantIds = new Set<string>();
  const renderableInterruptedAssistantIds = new Set<string>();
  const completedUserIds = new Set<string>();
  const failedUserIds = new Set<string>();

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      message.role === "assistant" &&
      (message.status === "pending" || message.status === "streaming")
    ) {
      if (messageHasRenderableParts(message)) {
        renderableInterruptedAssistantIds.add(message.id);
      } else {
        emptyInterruptedAssistantIds.add(message.id);
      }
    }

    if (
      message.role === "user" &&
      (message.status === "pending" || message.status === "completed")
    ) {
      const nextMessage = messages[index + 1];
      if (nextMessage?.role === "assistant") {
        const nextAssistantIsEmptyInterruption =
          (nextMessage.status === "pending" || nextMessage.status === "streaming") &&
          !messageHasRenderableParts(nextMessage);
        if (message.status === "pending" && !nextAssistantIsEmptyInterruption) {
          completedUserIds.add(message.id);
        }
      } else {
        failedUserIds.add(message.id);
      }
      continue;
    }

    if (!emptyInterruptedAssistantIds.has(message.id)) continue;

    const previousMessage = messages[index - 1];
    if (previousMessage?.role === "user") {
      failedUserIds.add(previousMessage.id);
    }
  }

  if (
    emptyInterruptedAssistantIds.size === 0 &&
    renderableInterruptedAssistantIds.size === 0 &&
    completedUserIds.size === 0 &&
    failedUserIds.size === 0
  ) {
    return messages;
  }

  let nextMessages = messages;
  let deletedEmptyAssistants = false;

  if (emptyInterruptedAssistantIds.size > 0) {
    try {
      await deleteMessages(vault, [...emptyInterruptedAssistantIds]);
      nextMessages = nextMessages.filter(
        (message) => !emptyInterruptedAssistantIds.has(message.id),
      );
      deletedEmptyAssistants = true;
    } catch {
      // Delete failed for empty assistants; continue with remaining settlement
      // so renderable assistants and failed users are still processed.
    }
  }

  for (const messageId of renderableInterruptedAssistantIds) {
    try {
      await updateMessageStatus(messageId, "cancelled");
      nextMessages = nextMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              status: "cancelled" as const,
            }
          : message,
      );
    } catch {
      // Keep local state aligned with DB; a future reload can retry settlement.
    }
  }

  for (const messageId of completedUserIds) {
    try {
      await updateMessageStatus(messageId, "completed");
      nextMessages = nextMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              status: "completed" as const,
            }
          : message,
      );
    } catch {
      // Keep local state aligned with DB; a future reload can retry settlement.
    }
  }

  for (const messageId of failedUserIds) {
    try {
      await updateMessageStatus(messageId, "failed");
      nextMessages = nextMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              status: "failed" as const,
            }
          : message,
      );
    } catch {
      // Keep local state aligned with DB; a future reload can retry settlement.
    }
  }

  if (deletedEmptyAssistants) {
    await refreshConversationLastMessageAt(conversationId).catch(() => undefined);
  }

  return nextMessages;
}
