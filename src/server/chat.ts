import {
  composeLanguageStyleInstruction,
  composeGlobalInstructions,
  defaultUserPreferences,
  normalizeUserPreferences,
  type UserPreferences,
} from "../lib/userPreferences";

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

type ChatRequestMessage = {
  id?: string;
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
};

type ChatRequest = {
  provider: ProviderId;
  model: string;
  apiKey: string;
  conversationId?: string;
  currentMessage?: ChatRequestMessage;
  assistantMessageId?: string;
  preferences?: unknown;
  temperature?: number;
  maxTokens?: number;
  thinkingMode?: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
};

type AuthenticatedSession = {
  authorization: string;
  userId: string;
};

type SupabaseAuthEnv = {
  anonKey: string;
  url: string;
};

type ServerContext = {
  memories: MemoryContext[];
  preferences: UserPreferences;
  summary: ConversationSummary | null;
};

type MemoryContext = {
  id: string;
  content: string;
};

type ConversationSummary = {
  summary: string;
  message_count?: number | null;
};

type ContextSnapshot = {
  generatedAt: string;
  conversationId?: string;
  model: string;
  provider: ProviderId;
  blocks: Array<{
    title: string;
    kind: "instructions" | "summary" | "memories" | "style" | "request";
    content: string;
  }>;
};

type MemoryAction =
  | { action: "create"; content: string }
  | { action: "update"; id: string; content: string }
  | { action: "archive"; id: string };

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

  const sessionResult = await validateSupabaseSession(request, env);
  if (sessionResult instanceof Response) return sessionResult;
  const session = sessionResult;

  const body = await parseJson<ChatRequest>(request);
  const validationError = validateChatRequest(body);
  if (validationError) return validationError;
  const chatRequest = body as ChatRequest;
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
  const serverContext = await loadServerContext(
    supabaseAuthEnv,
    session,
    chatRequest,
  );
  const providerMessages = buildProviderMessages(chatRequest, serverContext);
  const contextSnapshot = buildContextSnapshot(
    chatRequest,
    serverContext,
    providerMessages,
  );

  let upstream: Response;

  try {
    upstream = await fetch(providerEndpoint(env, chatRequest.provider, "chat"), {
      method: "POST",
      headers: providerJsonHeaders(chatRequest.apiKey),
      body: JSON.stringify(buildProviderChatBody(chatRequest, providerMessages)),
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

  return new Response(
    streamChatCompletionText(upstream.body, {
      context: contextSnapshot,
      onComplete: async (assistantText) => {
        if (!assistantText.trim()) return;
        await persistContextAfterTurn(
          env,
          supabaseAuthEnv,
          session,
          chatRequest,
          serverContext,
          assistantText,
        );
      },
    }),
    {
    headers: noStoreHeaders("application/x-ndjson; charset=utf-8"),
    },
  );
}

export async function handleModelsRequest(request: Request, env: ServerEnv) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const authError = await validateSupabaseSession(request, env);
  if (authError instanceof Response) return authError;

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

  const payload = (await response.json().catch(() => null)) as
    | { id?: unknown }
    | null;
  if (typeof payload?.id !== "string") {
    return json({ error: "Invalid Supabase session." }, 401);
  }

  return {
    authorization,
    userId: payload.id,
  } satisfies AuthenticatedSession;
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
  if (!body.currentMessage) {
    return json({ error: "Current message is required." }, 400);
  }
  if (!Array.isArray(body.currentMessage.parts)) {
    return json({ error: "Current message must include parts." }, 400);
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

async function loadServerContext(
  env: SupabaseAuthEnv,
  session: AuthenticatedSession,
  chatRequest: ChatRequest,
): Promise<ServerContext> {
  const preferences = chatRequest.preferences
    ? normalizeUserPreferences(chatRequest.preferences)
    : await loadUserPreferencesFromSupabase(env, session);
  const [summary, memories] = await Promise.all([
    chatRequest.conversationId
      ? loadConversationSummary(env, session, chatRequest.conversationId)
      : Promise.resolve(null),
    preferences.memoryEnabled
      ? loadUserMemories(env, session)
      : Promise.resolve<MemoryContext[]>([]),
  ]);

  return {
    memories,
    preferences,
    summary,
  };
}

async function loadUserPreferencesFromSupabase(
  env: SupabaseAuthEnv,
  session: AuthenticatedSession,
) {
  const response = await supabaseRestFetch(
    env,
    session,
    `/rest/v1/user_preferences?user_id=eq.${encodeURIComponent(
      session.userId,
    )}&select=preferences&limit=1`,
  );
  if (!response.ok) {
    if (isMissingRestResource(response)) return defaultUserPreferences;
    console.warn("Unable to load user preferences.", await response.text());
    return defaultUserPreferences;
  }

  const rows = (await response.json().catch(() => [])) as Array<{
    preferences?: unknown;
  }>;
  return rows[0]?.preferences
    ? normalizeUserPreferences(rows[0].preferences)
    : defaultUserPreferences;
}

async function loadConversationSummary(
  env: SupabaseAuthEnv,
  session: AuthenticatedSession,
  conversationId: string,
) {
  const response = await supabaseRestFetch(
    env,
    session,
    `/rest/v1/conversation_summaries?conversation_id=eq.${encodeURIComponent(
      conversationId,
    )}&user_id=eq.${encodeURIComponent(
      session.userId,
    )}&select=summary,message_count&limit=1`,
  );
  if (!response.ok) {
    if (isMissingRestResource(response)) return null;
    console.warn("Unable to load conversation summary.", await response.text());
    return null;
  }

  const rows = (await response.json().catch(() => [])) as ConversationSummary[];
  return rows[0] ?? null;
}

async function loadUserMemories(
  env: SupabaseAuthEnv,
  session: AuthenticatedSession,
) {
  const response = await supabaseRestFetch(
    env,
    session,
    `/rest/v1/user_memories?user_id=eq.${encodeURIComponent(
      session.userId,
    )}&status=eq.active&select=id,content&order=updated_at.desc&limit=12`,
  );
  if (!response.ok) {
    if (isMissingRestResource(response)) return [];
    console.warn("Unable to load user memories.", await response.text());
    return [];
  }

  const rows = (await response.json().catch(() => [])) as Array<{
    id?: unknown;
    content?: unknown;
  }>;
  return rows.flatMap((row) =>
    typeof row.id === "string" &&
    typeof row.content === "string" &&
    row.content.trim()
      ? [{ id: row.id, content: row.content.trim() }]
      : [],
  );
}

function buildProviderMessages(
  chatRequest: ChatRequest,
  serverContext: ServerContext,
) {
  const currentMessage = chatRequest.currentMessage;
  if (!currentMessage) throw new Error("Current message is required.");

  const messages: ChatRequestMessage[] = [];
  const globalInstructions = composeGlobalInstructions(serverContext.preferences);
  if (globalInstructions.trim()) {
    messages.push(systemMessage(globalInstructions.trim()));
  }

  if (serverContext.summary?.summary.trim()) {
    messages.push(
      systemMessage(
        [
          "Conversation summary for earlier turns. Use it as compressed context; recent messages below are more authoritative.",
          serverContext.summary.summary.trim(),
        ].join("\n"),
      ),
    );
  }

  if (
    serverContext.preferences.memoryEnabled &&
    serverContext.memories.length > 0
  ) {
    messages.push(
      systemMessage(
        [
          "Saved user memories. Apply them only when relevant to the current request.",
          ...serverContext.memories.map((memory) => `- ${memory.content}`),
        ].join("\n"),
      ),
    );
  }

  messages.push(
    systemMessage(
      [
        "Apply the selected language style to the next assistant answer.",
        composeLanguageStyleInstruction(serverContext.preferences),
      ].join("\n"),
    ),
  );
  messages.push(currentMessage);
  return messages;
}

function systemMessage(text: string): ChatRequestMessage {
  return {
    role: "system",
    parts: [{ type: "text", text }],
  };
}

function buildContextSnapshot(
  chatRequest: ChatRequest,
  serverContext: ServerContext,
  providerMessages: ChatRequestMessage[],
): ContextSnapshot {
  const systemMessages = providerMessages.filter(
    (message) => message.role === "system",
  );
  const currentRequest = chatRequest.currentMessage
    ? textFromParts(chatRequest.currentMessage.parts)
    : "";
  const blocks: ContextSnapshot["blocks"] = [];

  for (const message of systemMessages) {
    const content = textFromParts(message.parts).trim();
    if (!content) continue;
    const kind = contextBlockKind(content);
    blocks.push({
      title: contextBlockTitle(kind),
      kind,
      content,
    });
  }

  if (currentRequest.trim()) {
    blocks.push({
      title: "Current request",
      kind: "request",
      content: compactText(currentRequest, 1800),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    ...(chatRequest.conversationId
      ? { conversationId: chatRequest.conversationId }
      : {}),
    model: chatRequest.model,
    provider: chatRequest.provider,
    blocks,
  };
}

function contextBlockKind(content: string): ContextSnapshot["blocks"][number]["kind"] {
  if (content.startsWith("Conversation summary")) return "summary";
  if (content.startsWith("Saved user memories")) return "memories";
  if (content.startsWith("Apply the selected language style")) return "style";
  return "instructions";
}

function contextBlockTitle(kind: ContextSnapshot["blocks"][number]["kind"]) {
  if (kind === "summary") return "Conversation summary";
  if (kind === "memories") return "Saved memories";
  if (kind === "style") return "Language style";
  if (kind === "request") return "Current request";
  return "Global instructions";
}

async function persistContextAfterTurn(
  providerEnv: ServerEnv,
  env: SupabaseAuthEnv,
  session: AuthenticatedSession,
  chatRequest: ChatRequest,
  serverContext: ServerContext,
  assistantText: string,
) {
  if (!chatRequest.conversationId || !chatRequest.currentMessage) return;

  const userText = textFromParts(chatRequest.currentMessage.parts).trim();
  await saveConversationSummary(
    env,
    session,
    chatRequest,
    serverContext.summary,
    userText,
    assistantText,
  );

  if (!serverContext.preferences.memoryEnabled) return;
  await saveExtractedMemories(
    providerEnv,
    env,
    session,
    chatRequest,
    serverContext,
    userText,
    assistantText,
  );
}

async function saveConversationSummary(
  env: SupabaseAuthEnv,
  session: AuthenticatedSession,
  chatRequest: ChatRequest,
  currentSummary: ConversationSummary | null,
  userText: string,
  assistantText: string,
) {
  if (!chatRequest.conversationId) return;
  const now = new Date().toISOString();
  const nextSummary = buildNextSummary(
    currentSummary?.summary ?? "",
    userText,
    assistantText,
  );

  const response = await supabaseRestFetch(
    env,
    session,
    "/rest/v1/conversation_summaries?on_conflict=conversation_id",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        conversation_id: chatRequest.conversationId,
        user_id: session.userId,
        summary: nextSummary,
        message_count: Math.max(0, currentSummary?.message_count ?? 0) + 2,
        last_message_id: chatRequest.assistantMessageId ?? null,
        updated_at: now,
      }),
    },
  );

  if (!response.ok && !isMissingRestResource(response)) {
    console.warn("Unable to save conversation summary.", await response.text());
  }
}

async function saveExtractedMemories(
  providerEnv: ServerEnv,
  env: SupabaseAuthEnv,
  session: AuthenticatedSession,
  chatRequest: ChatRequest,
  serverContext: ServerContext,
  userText: string,
  assistantText: string,
) {
  const actions =
    (await extractMemoryActions(providerEnv, chatRequest, serverContext, {
      assistantText,
      userText,
    })) ?? fallbackMemoryActions(userText, serverContext.memories);
  if (actions.length === 0) return;

  const now = new Date().toISOString();
  const creates = actions.filter(
    (action): action is Extract<MemoryAction, { action: "create" }> =>
      action.action === "create",
  );
  const updates = actions.filter(
    (action): action is Extract<MemoryAction, { action: "update" }> =>
      action.action === "update",
  );
  const archives = actions.filter(
    (action): action is Extract<MemoryAction, { action: "archive" }> =>
      action.action === "archive",
  );

  if (creates.length > 0) {
    const response = await supabaseRestFetch(
      env,
      session,
      "/rest/v1/user_memories",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(
          creates.map(({ content }) => ({
            user_id: session.userId,
            content,
            source_conversation_id: chatRequest.conversationId ?? null,
            source_message_id: chatRequest.currentMessage?.id ?? null,
            status: "active",
            updated_at: now,
          })),
        ),
      },
    );

    if (!response.ok && !isMissingRestResource(response)) {
      console.warn("Unable to create user memories.", await response.text());
    }
  }

  await Promise.all(
    updates.map(async ({ content, id }) => {
      const response = await supabaseRestFetch(
        env,
        session,
        `/rest/v1/user_memories?id=eq.${encodeURIComponent(
          id,
        )}&user_id=eq.${encodeURIComponent(session.userId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            content,
            status: "active",
            updated_at: now,
          }),
        },
      );

      if (!response.ok && !isMissingRestResource(response)) {
        console.warn("Unable to update user memory.", await response.text());
      }
    }),
  );

  await Promise.all(
    archives.map(async ({ id }) => {
      const response = await supabaseRestFetch(
        env,
        session,
        `/rest/v1/user_memories?id=eq.${encodeURIComponent(
          id,
        )}&user_id=eq.${encodeURIComponent(session.userId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            status: "archived",
            updated_at: now,
          }),
        },
      );

      if (!response.ok && !isMissingRestResource(response)) {
        console.warn("Unable to archive user memory.", await response.text());
      }
    }),
  );
}

async function extractMemoryActions(
  env: ServerEnv,
  chatRequest: ChatRequest,
  serverContext: ServerContext,
  turn: {
    assistantText: string;
    userText: string;
  },
): Promise<MemoryAction[] | null> {
  try {
    const response = await fetch(providerEndpoint(env, chatRequest.provider, "chat"), {
      method: "POST",
      headers: providerJsonHeaders(chatRequest.apiKey),
      body: JSON.stringify({
        model: chatRequest.model,
        messages: [
          {
            role: "system",
            content: [
              "You maintain durable user memories for an assistant.",
              "Return strict JSON only. Do not include markdown.",
              "Create or update a memory only for stable, reusable facts or preferences that can help future conversations.",
              "Do not store transient tasks, secrets, credentials, sensitive personal data, medical/legal/financial details, or one-off conversation content.",
              "Prefer update over create when an existing memory is related or contradicted.",
              'Schema: {"actions":[{"action":"create","content":"..."},{"action":"update","id":"existing-id","content":"..."},{"action":"archive","id":"existing-id"}]}',
              "Use at most 4 actions. Use an empty actions array when nothing should be remembered.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                existingMemories: serverContext.memories,
                userMessage: compactText(turn.userText, 3000),
                assistantAnswer: compactText(turn.assistantText, 3000),
              },
              null,
              2,
            ),
          },
        ],
        temperature: 0,
        max_tokens: 700,
        stream: false,
      }),
    });

    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as unknown;
    const content = providerMessageContent(payload);
    if (!content) return null;
    return normalizeMemoryActions(content, serverContext.memories);
  } catch {
    return null;
  }
}

function providerMessageContent(payload: unknown) {
  const value = objectValue(payload);
  const choices = Array.isArray(value?.choices) ? value.choices : [];
  const firstChoice = objectValue(choices[0]);
  const message = objectValue(firstChoice?.message);
  return typeof message?.content === "string" ? message.content : null;
}

function normalizeMemoryActions(
  rawContent: string,
  existingMemories: MemoryContext[],
) {
  const parsed = parseJsonObject(rawContent);
  const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const existingIds = new Set(existingMemories.map((memory) => memory.id));
  const normalized: MemoryAction[] = [];
  const seenCreates = new Set<string>();

  for (const action of actions) {
    const value = objectValue(action);
    const actionType = value?.action;
    const content =
      typeof value?.content === "string"
        ? compactText(value.content, 320).trim()
        : "";
    const id = typeof value?.id === "string" ? value.id : "";

    if (actionType === "create" && content.length >= 4) {
      const key = normalizeMemoryText(content);
      if (seenCreates.has(key)) continue;
      seenCreates.add(key);
      normalized.push({ action: "create", content });
    } else if (
      actionType === "update" &&
      existingIds.has(id) &&
      content.length >= 4
    ) {
      normalized.push({ action: "update", id, content });
    } else if (actionType === "archive" && existingIds.has(id)) {
      normalized.push({ action: "archive", id });
    }
  }

  return normalized.slice(0, 4);
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return objectValue(parsed);
  } catch {
    return null;
  }
}

function fallbackMemoryActions(
  text: string,
  existingMemories: MemoryContext[],
): MemoryAction[] {
  const memories = extractMemoryCandidates(text);
  if (memories.length === 0) return [];
  const existingByText = new Map(
    existingMemories.map((memory) => [
      normalizeMemoryText(memory.content),
      memory,
    ]),
  );

  return memories.flatMap((content) => {
    const existing = existingByText.get(normalizeMemoryText(content));
    if (existing) return [];
    return [{ action: "create", content } satisfies MemoryAction];
  });
}

function normalizeMemoryText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildNextSummary(
  previousSummary: string,
  userText: string,
  assistantText: string,
) {
  const entries = [
    previousSummary.trim(),
    [
      `User: ${compactText(userText, 900)}`,
      `Assistant: ${compactText(assistantText, 1200)}`,
    ].join("\n"),
  ].filter(Boolean);

  return compactText(entries.join("\n\n"), 6000);
}

function extractMemoryCandidates(text: string) {
  const patterns = [
    /(?:请记住|记住|你要记住)[:：]?\s*([^\n。！？!?]+[。！？!?]?)/gi,
    /(?:remember|please remember)[:\s]+([^\n.?!]+[.?!]?)/gi,
  ];
  const memories: string[] = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const memory = compactText(match[1] ?? "", 300).trim();
      if (memory.length >= 4) memories.push(memory);
    }
  }

  return [...new Set(memories)].slice(0, 3);
}

function compactText(text: string, maxLength: number) {
  const compacted = text.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function supabaseRestFetch(
  env: SupabaseAuthEnv,
  session: AuthenticatedSession,
  path: string,
  init: RequestInit = {},
) {
  return fetch(`${env.url}${path}`, {
    ...init,
    headers: {
      apikey: env.anonKey,
      Authorization: session.authorization,
      ...(init.headers ?? {}),
    },
  });
}

function isMissingRestResource(response: Response) {
  return response.status === 404 || response.status === 406;
}

function buildProviderChatBody(
  chatRequest: ChatRequest,
  messages: ChatRequestMessage[],
) {
  const hasAttachments = messagesHaveTransmittableAttachments(messages);

  return {
    model: chatRequest.model,
    messages: messages.map((message) => ({
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
  message: ChatRequestMessage,
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

function messagesHaveTransmittableAttachments(messages: ChatRequestMessage[]) {
  return messages.some((message) =>
    message.parts.some((part) => {
      if (part.type !== "image" && part.type !== "file") return false;
      return Boolean(message.attachments?.[part.attachmentId]?.dataUrl);
    }),
  );
}

function textFromParts(parts: ChatRequestMessage["parts"]) {
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

function streamChatCompletionText(
  body: ReadableStream<Uint8Array>,
  options: {
    context?: ContextSnapshot;
    onComplete?: (assistantText: string) => Promise<void>;
  } = {},
) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let assistantText = "";

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        if (!options.context) return;
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "context", context: options.context }) +
              "\n",
          ),
        );
      },
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
              assistantText += text;
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
      async flush() {
        await options.onComplete?.(assistantText);
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
