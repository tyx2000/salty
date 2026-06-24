export type ProviderId = "openai" | "deepseek";

type ThinkingMode = "enabled" | "disabled";

type ReasoningEffort = "default" | "minimal" | "low" | "medium" | "high";

export type ServerEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  OPENAI_BASE_URL?: string;
  DEEPSEEK_BASE_URL?: string;
};

type ChatRequest = {
  provider: ProviderId;
  model: string;
  apiKey: string;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    parts: Array<
      | { type: "text"; text: string }
      | { type: "markdown"; text: string }
      | { type: "image"; attachmentId: string }
      | { type: "file"; attachmentId: string }
      | { type: "json"; value: unknown }
      | { type: "tool_call"; name: string; arguments: unknown }
      | { type: "tool_result"; name: string; result: unknown }
    >;
    attachments?: Record<
      string,
      {
        fileName: string;
        mimeType: string;
        dataUrl?: string;
      }
    >;
  }>;
  temperature?: number;
  maxTokens?: number;
  thinkingMode?: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
};

type ProviderKeyRequest = {
  provider: ProviderId;
  apiKey: string;
};

type ProviderModelResponse = {
  id: string;
  description?: string;
};

const defaultProviderBaseUrls: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
};

const providerPaths: Record<ProviderId, { chat: string; models: string }> = {
  openai: {
    chat: "/chat/completions",
    models: "/models",
  },
  deepseek: {
    chat: "/chat/completions",
    models: "/models",
  },
};

export async function handleChatRequest(request: Request, env: ServerEnv) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const authError = await validateSupabaseSession(request, env);
  if (authError) return authError;

  const body = await parseJson<ChatRequest>(request);
  const validationError = validateChatRequest(body);
  if (validationError) return validationError;
  const chatRequest = body as ChatRequest;

  let upstream: Response;

  try {
    upstream = await fetch(providerEndpoint(env, chatRequest.provider, "chat"), {
      method: "POST",
      headers: providerJsonHeaders(chatRequest.apiKey),
      body: JSON.stringify(buildProviderChatBody(chatRequest)),
    });
  } catch (error) {
    return json(
      { error: providerConnectionError(chatRequest.provider, error) },
      502,
    );
  }

  if (!upstream.ok || !upstream.body) {
    return json(
      { error: await readProviderError(chatRequest.provider, upstream) },
      upstream.status || 502,
    );
  }

  return new Response(streamChatCompletionText(upstream.body), {
    headers: noStoreHeaders("application/x-ndjson; charset=utf-8"),
  });
}

export async function handleModelsRequest(request: Request, env: ServerEnv) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const authError = await validateSupabaseSession(request, env);
  if (authError) return authError;

  const body = await parseJson<ProviderKeyRequest>(request);
  const validationError = validateProviderKeyRequest(body);
  if (validationError) return validationError;
  const keyRequest = body as ProviderKeyRequest;

  let upstream: Response;

  try {
    upstream = await fetch(providerEndpoint(env, keyRequest.provider, "models"), {
      headers: providerAuthHeaders(keyRequest.apiKey),
    });
  } catch (error) {
    return json(
      { error: providerConnectionError(keyRequest.provider, error) },
      502,
    );
  }

  if (!upstream.ok) {
    return json(
      { error: await readProviderError(keyRequest.provider, upstream) },
      upstream.status || 502,
    );
  }

  const payload = (await upstream.json()) as { data?: Array<Record<string, unknown>> };
  const models = (payload.data ?? [])
    .map((item) => normalizeProviderModel(item))
    .filter((item): item is ProviderModelResponse => Boolean(item))
    .filter((item) => isLikelyChatModel(keyRequest.provider, item.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  return json({ models }, 200);
}

export async function handleTestKeyRequest(request: Request, env: ServerEnv) {
  const response = await handleModelsRequest(request, env);
  if (!response.ok) return response;

  const payload = (await response.json()) as { models: ProviderModelResponse[] };
  return json(
    {
      ok: true,
      models: payload.models,
      message:
        payload.models.length > 0
          ? "Provider key is valid."
          : "Provider key is valid, but no chat models were returned.",
    },
    200,
  );
}

export function routeApiRequest(request: Request, env: ServerEnv) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/chat") return handleChatRequest(request, env);
  if (pathname === "/api/models") return handleModelsRequest(request, env);
  if (pathname === "/api/test-key") return handleTestKeyRequest(request, env);
  return json({ error: "API route not found." }, 404);
}

function providerAuthHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

function providerJsonHeaders(apiKey: string) {
  return {
    ...providerAuthHeaders(apiKey),
    "Content-Type": "application/json",
  };
}

async function validateSupabaseSession(request: Request, env: ServerEnv) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Missing Supabase session." }, 401);
  }

  const supabaseAuthEnv = getSupabaseAuthEnv(env);
  if (!supabaseAuthEnv) {
    return json(
      {
        error:
          "Server is missing Supabase auth env vars. Set SUPABASE_URL and SUPABASE_ANON_KEY in the runtime environment.",
      },
      500,
    );
  }

  const response = await fetch(`${supabaseAuthEnv.url}/auth/v1/user`, {
    headers: {
      apikey: supabaseAuthEnv.anonKey,
      Authorization: authorization,
    },
  });

  if (!response.ok) {
    return json({ error: "Invalid Supabase session." }, 401);
  }

  return null;
}

function getSupabaseAuthEnv(env: ServerEnv) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function providerEndpoint(
  env: ServerEnv,
  provider: ProviderId,
  endpoint: "chat" | "models",
) {
  const baseUrl = providerBaseUrl(env, provider).replace(/\/+$/, "");
  const path = providerPaths[provider][endpoint];
  if (!path) throw new Error(`${provider} does not support ${endpoint}.`);
  return `${baseUrl}${path}`;
}

function providerBaseUrl(env: ServerEnv, provider: ProviderId) {
  if (provider === "openai") {
    return env.OPENAI_BASE_URL || defaultProviderBaseUrls.openai;
  }

  return env.DEEPSEEK_BASE_URL || defaultProviderBaseUrls.deepseek;
}

async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function validateProviderKeyRequest(body: ProviderKeyRequest | null) {
  if (!body) return json({ error: "Invalid JSON body." }, 400);
  if (body.provider !== "openai" && body.provider !== "deepseek") {
    return json({ error: "Unsupported provider." }, 400);
  }
  if (!body.apiKey?.trim()) return json({ error: "Provider API key is required." }, 400);
  return null;
}

function validateChatRequest(body: ChatRequest | null) {
  const providerError = validateProviderKeyRequest(body);
  if (providerError) return providerError;
  if (!body?.model?.trim()) return json({ error: "Model is required." }, 400);
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "At least one message is required." }, 400);
  }
  if (!body.messages.every((message) => Array.isArray(message.parts))) {
    return json({ error: "Every message must include parts." }, 400);
  }
  if (
    body.thinkingMode &&
    !["enabled", "disabled"].includes(body.thinkingMode)
  ) {
    return json({ error: "Unsupported thinking mode." }, 400);
  }
  if (
    body.reasoningEffort &&
    !["default", "minimal", "low", "medium", "high"].includes(
      body.reasoningEffort,
    )
  ) {
    return json({ error: "Unsupported reasoning effort." }, 400);
  }
  return null;
}

function buildProviderChatBody(chatRequest: ChatRequest) {
  const hasAttachments = requestHasTransmittableAttachments(chatRequest);

  return {
    model: chatRequest.model,
    messages: chatRequest.messages.map((message) => ({
      role: message.role,
      content: buildMessageContent(message, hasAttachments),
    })),
    ...(typeof chatRequest.temperature === "number"
      ? { temperature: chatRequest.temperature }
      : {}),
    ...buildThinkingParams(chatRequest),
    max_tokens: chatRequest.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
}

function buildThinkingParams(chatRequest: ChatRequest) {
  return {
    ...(chatRequest.thinkingMode
      ? { thinking: { type: chatRequest.thinkingMode } }
      : {}),
    ...(chatRequest.reasoningEffort &&
    chatRequest.reasoningEffort !== "default"
      ? { reasoning_effort: chatRequest.reasoningEffort }
      : {}),
  };
}

function buildMessageContent(
  message: ChatRequest["messages"][number],
  hasAttachmentsInRequest: boolean,
): string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: string } }> {
  if (!hasAttachmentsInRequest || message.role === "assistant") {
    return textFromParts(message.parts);
  }

  const blocks: Array<
    { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: string } }
  > = [];

  for (const part of message.parts) {
    if (part.type === "text" || part.type === "markdown") {
      if (part.text) {
        blocks.push({ type: "text", text: part.text });
      }
    } else if (part.type === "json") {
      blocks.push({ type: "text", text: JSON.stringify(part.value, null, 2) });
    } else if (part.type === "image") {
      const attachment = message.attachments?.[part.attachmentId];
      if (attachment?.dataUrl) {
        blocks.push({
          type: "image_url",
          image_url: { url: attachment.dataUrl, detail: "auto" },
        });
      }
    }
    // Skip file and tool parts that can't go into chat completions content.
  }

  if (blocks.length === 0) {
    return textFromParts(message.parts);
  }

  return blocks;
}

function requestHasTransmittableAttachments(chatRequest: ChatRequest) {
  return chatRequest.messages.some((message) =>
    message.parts.some((part) => {
      if (part.type !== "image" && part.type !== "file") return false;
      return Boolean(message.attachments?.[part.attachmentId]?.dataUrl);
    }),
  );
}

function textFromParts(parts: ChatRequest["messages"][number]["parts"]) {
  return parts
    .flatMap((part) => {
      if (part.type === "text" || part.type === "markdown") return [part.text];
      if (part.type === "json") return [JSON.stringify(part.value, null, 2)];
      return [];
    })
    .join("\n\n");
}

function normalizeProviderModel(
  item: Record<string, unknown>,
): ProviderModelResponse | null {
  const id = typeof item.id === "string" ? item.id : null;
  if (!id) return null;

  const description = modelDescription(item);
  return description ? { id, description } : { id };
}

function modelDescription(item: Record<string, unknown>) {
  const directDescription = firstString(
    item.description,
    item.capability_description,
    item.capabilities_description,
    item.summary,
  );
  if (directDescription) return directDescription;

  const metadata = objectValue(item.metadata);
  const metadataDescription = metadata
    ? firstString(
        metadata.description,
        metadata.capability_description,
        metadata.capabilities_description,
        metadata.summary,
      )
    : null;
  if (metadataDescription) return metadataDescription;

  const capabilities = item.capabilities;
  if (Array.isArray(capabilities)) {
    const values = capabilities.filter(
      (capability): capability is string => typeof capability === "string",
    );
    return values.length > 0 ? values.join(", ") : undefined;
  }

  const capabilityObject = objectValue(capabilities);
  if (!capabilityObject) return undefined;

  return firstString(
    capabilityObject.description,
    capabilityObject.summary,
    capabilityObject.type,
  );
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => {
    return typeof value === "string" && value.trim().length > 0;
  });
}

function objectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isLikelyChatModel(provider: ProviderId, id: string) {
  if (provider === "deepseek") return id.startsWith("deepseek-");
  return (
    id.startsWith("gpt-") ||
    id.startsWith("o") ||
    id.startsWith("chatgpt-")
  );
}

function streamChatCompletionText(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.delta?.content;
            if (typeof text === "string") {
              controller.enqueue(
                encoder.encode(JSON.stringify({ type: "token", text }) + "\n"),
              );
            }

            const usage = normalizeUsage(parsed.usage);
            if (usage) {
              controller.enqueue(
                encoder.encode(JSON.stringify({ type: "usage", usage }) + "\n"),
              );
            }
          } catch {
            // Ignore malformed provider chunks; the connection remains open for later chunks.
          }
        }
      },
    }),
  );
}

function normalizeUsage(usage: unknown) {
  const value = objectValue(usage);
  if (!value) return null;

  const promptTokens = numberValue(value.prompt_tokens);
  const completionTokens = numberValue(value.completion_tokens);
  const totalTokens = numberValue(value.total_tokens);

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined
  ) {
    return null;
  }

  return {
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function readProviderError(provider: ProviderId, response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return (
      payload.error?.message ||
      `${providerLabel(provider)} request failed with HTTP ${response.status}.`
    );
  } catch {
    return `${providerLabel(provider)} request failed with HTTP ${response.status}.`;
  }
}

function providerConnectionError(provider: ProviderId, error: unknown) {
  const detail = error instanceof Error ? ` ${error.message}` : "";
  return `Unable to reach ${providerLabel(provider)} API.${detail}`;
}

function providerLabel(provider: ProviderId) {
  return provider === "openai" ? "OpenAI" : "DeepSeek";
}

function noStoreHeaders(contentType: string) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(payload: unknown, status: number) {
  return Response.json(payload, {
    status,
    headers: noStoreHeaders("application/json; charset=utf-8"),
  });
}
