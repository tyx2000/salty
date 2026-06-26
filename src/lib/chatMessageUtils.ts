import type { ChatMessage, MessagePart } from "@/types/domain";

export function appendTokenToMessageParts(
  parts: ChatMessage["parts"],
  token: string,
): MessagePart[] {
  const nextParts = [...parts];
  const lastPart = nextParts[nextParts.length - 1];

  if (lastPart?.type === "markdown") {
    nextParts[nextParts.length - 1] = {
      ...lastPart,
      text: lastPart.text + token,
    };
    return nextParts;
  }

  return [...nextParts, { type: "markdown" as const, text: token }];
}

export function userTurnMessageIds(
  messages: ChatMessage[],
  userMessageId: string,
) {
  const userMessageIndex = messages.findIndex(
    (message) => message.id === userMessageId,
  );
  if (userMessageIndex < 0 || messages[userMessageIndex]?.role !== "user") return [];

  const nextMessage = messages[userMessageIndex + 1];
  return nextMessage?.role === "assistant"
    ? [userMessageId, nextMessage.id]
    : [userMessageId];
}

export function messageTurnPair(messages: ChatMessage[], messageId: string) {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return null;

  const message = messages[index];
  if (message?.role === "user") {
    const assistantMessage = messages[index + 1];
    if (assistantMessage?.role !== "assistant") return null;
    return {
      userMessage: message,
      assistantMessage,
    };
  }

  if (message?.role === "assistant") {
    const userMessage = messages[index - 1];
    if (userMessage?.role !== "user") return null;
    return {
      userMessage,
      assistantMessage: message,
    };
  }

  return null;
}

export function attachmentIdsFromParts(parts: MessagePart[]) {
  return [
    ...new Set(
      parts.flatMap((part) =>
        part.type === "image" || part.type === "file" ? [part.attachmentId] : [],
      ),
    ),
  ];
}

export function cloneMessageParts(parts: MessagePart[]) {
  return parts.map((part) => ({ ...part })) as MessagePart[];
}
