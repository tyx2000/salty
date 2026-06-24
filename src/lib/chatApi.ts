import { supabase } from "./supabase";
import type {
  ChatMessage,
  MessagePart,
  ProviderId,
  ProviderModel,
  ReasoningEffort,
  ThinkingMode,
} from "@/types/domain";

export type ChatApiInput = {
  provider: ProviderId;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  thinkingMode?: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
  onToken: (token: string) => void;
  signal?: AbortSignal;
};

export async function streamChat(input: ChatApiInput) {
  let assistantText = "";
  let response: Response;

  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: await authedJsonHeaders(),
      signal: input.signal,
      body: JSON.stringify({
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
        thinkingMode: input.thinkingMode,
        reasoningEffort: input.reasoningEffort,
        messages: input.messages.map(({ role, parts, attachments }) => ({
          role,
          parts,
          attachments,
        })),
      }),
    });
  } catch (error) {
    if (input.signal?.aborted) return assistantText;
    throw error;
  }

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error || "Chat request failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const token = decoder.decode(value, { stream: true });
      assistantText += token;
      input.onToken(token);
    }
  } catch (error) {
    if (!input.signal?.aborted) throw error;
  }

  return assistantText;
}

export function textFromParts(parts: MessagePart[]) {
  return parts
    .flatMap((part) => {
      if (part.type === "text" || part.type === "markdown") return [part.text];
      return [];
    })
    .join("\n\n");
}

export async function testProviderKey(provider: ProviderId, apiKey: string) {
  const response = await fetch("/api/test-key", {
    method: "POST",
    headers: await authedJsonHeaders(),
    body: JSON.stringify({ provider, apiKey }),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        models?: Array<string | ProviderModel>;
        message?: string;
        error?: string;
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Provider key test failed.");
  }

  return {
    models: normalizeModels(payload?.models ?? []),
    message: payload?.message ?? "Provider key is valid.",
  };
}

function normalizeModels(models: Array<string | ProviderModel>) {
  return models.flatMap((model) => {
    if (typeof model === "string") return [{ id: model }];
    if (!model.id) return [];
    return [
      {
        id: model.id,
        description: model.description,
      },
    ];
  });
}

async function authedJsonHeaders() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Please log in again.");

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}
