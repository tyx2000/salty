import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage } from "@/types/domain";
import { deleteMessages, updateMessageStatus } from "@/lib/messages";
import type { UnlockedVault } from "@/lib/vault";

type SetMessages = Dispatch<SetStateAction<ChatMessage[]>>;

export async function handleEmptyAssistantResponse({
  assistantMessage,
  setMessages,
  userMessage,
  vault,
  wasAborted,
}: {
  assistantMessage: ChatMessage;
  setMessages: SetMessages;
  userMessage: ChatMessage;
  vault: UnlockedVault;
  wasAborted: boolean;
}) {
  await deleteMessages(vault, [assistantMessage.id]);
  await updateMessageStatus(
    userMessage.id,
    wasAborted ? "cancelled" : "failed",
  ).catch(() => undefined);
  setMessages((current) =>
    current
      .filter((message) => message.id !== assistantMessage.id)
      .map((message) =>
        message.id === userMessage.id
          ? {
              ...message,
              status: wasAborted ? ("cancelled" as const) : ("failed" as const),
            }
          : message,
      ),
  );
}
