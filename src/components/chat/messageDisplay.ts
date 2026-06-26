import type {
  ChatMessage,
  ChatResponseStats,
  MessagePart,
} from "@/types/domain";

export function messageHasRenderableParts(message: ChatMessage) {
  return message.parts.some((part) => {
    if (part.type === "text" || part.type === "markdown") {
      return part.text.trim().length > 0;
    }

    return true;
  });
}

export function orderedMessageParts(parts: MessagePart[]) {
  const attachments = parts.filter(
    (part) => part.type === "image" || part.type === "file",
  );
  const rest = parts.filter((part) => part.type !== "image" && part.type !== "file");
  return [...attachments, ...rest];
}

export function messageHasAttachmentsAndBody(parts: MessagePart[]) {
  const hasAttachment = parts.some(
    (part) => part.type === "image" || part.type === "file",
  );
  const hasBody = parts.some((part) => {
    if (part.type === "image" || part.type === "file") return false;
    if (part.type === "text" || part.type === "markdown") {
      return part.text.trim().length > 0;
    }
    return true;
  });
  return hasAttachment && hasBody;
}

export function formatResponseStats(stats: ChatResponseStats) {
  const values = [formatDuration(stats.elapsedMs)];
  const totalTokens = stats.usage?.totalTokens;

  if (typeof totalTokens === "number") {
    values.push(`${totalTokens.toLocaleString()} tokens`);
  }

  return values.join(" · ");
}

function formatDuration(elapsedMs: number) {
  if (elapsedMs < 1000) return `${elapsedMs}ms`;
  return `${(elapsedMs / 1000).toFixed(elapsedMs < 10000 ? 1 : 0)}s`;
}
