import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage, ChatResponseStats } from "@/types/domain";
import { appendTokenToMessageParts } from "@/lib/chatMessageUtils";
import { estimateUsageFromText } from "@/lib/chatUsageEstimate";

type CreateAssistantStreamStateOptions = {
  assistantMessageId: string;
  responseStartedAt: number;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
};

export function createAssistantStreamState({
  assistantMessageId,
  responseStartedAt,
  setMessages,
}: CreateAssistantStreamStateOptions) {
  let streamedText = "";
  let latestUsage = undefined as ChatResponseStats["usage"] | undefined;

  function elapsedMs() {
    return Math.max(0, Math.round(performance.now() - responseStartedAt));
  }

  return {
    startStatsTimer() {
      return window.setInterval(() => {
        if (!streamedText.trim()) return;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  responseStats: {
                    elapsedMs: elapsedMs(),
                    usage: latestUsage ?? estimateUsageFromText(streamedText),
                  },
                }
              : message,
          ),
        );
      }, 250);
    },
    appendToken(token: string) {
      streamedText += token;
      const estimatedUsage = estimateUsageFromText(streamedText);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                parts: appendTokenToMessageParts(message.parts, token),
                responseStats: {
                  elapsedMs: elapsedMs(),
                  usage: latestUsage ?? estimatedUsage,
                },
              }
            : message,
        ),
      );
    },
    setUsage(usage: ChatResponseStats["usage"]) {
      latestUsage = usage;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                responseStats: {
                  elapsedMs: elapsedMs(),
                  usage,
                },
              }
            : message,
        ),
      );
    },
  };
}
