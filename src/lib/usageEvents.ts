import type { ChatResponseStats, ProviderId } from "@/types/domain";
import { decryptString, encryptString } from "./crypto";
import { supabase } from "./supabase";
import type { UnlockedVault } from "./vault";

type RecordUsageEventInput = {
  conversationId?: string | null;
  messageId?: string | null;
  provider: ProviderId;
  model: string;
  stats?: ChatResponseStats;
  latencyMs?: number;
  success: boolean;
  errorCode?: string;
};

export type UsageEventRecord = {
  id: string;
  provider: ProviderId;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
  errorCode: string | null;
  createdAt: string;
};

type StoredUsageEvent = {
  id: string;
  provider: ProviderId;
  model_ciphertext: string | null;
  model_nonce: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  success: boolean;
  error_code: string | null;
  created_at: string;
};

function usageEventAad(userId: string, eventId: string) {
  return `usage-event:${userId}:${eventId}:v1`;
}

export async function recordUsageEvent(
  vault: UnlockedVault,
  input: RecordUsageEventInput,
) {
  const id = crypto.randomUUID();
  const encryptedModel = await encryptString(
    vault.masterKey,
    input.model,
    `${usageEventAad(vault.userId, id)}:model`,
  );
  const usage = input.stats?.usage;

  const { error } = await supabase.from("usage_events").insert({
    id,
    user_id: vault.userId,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
    provider: input.provider,
    model_ciphertext: encryptedModel.ciphertext,
    model_nonce: encryptedModel.nonce,
    prompt_tokens: usage?.promptTokens ?? null,
    completion_tokens: usage?.completionTokens ?? null,
    total_tokens: usage?.totalTokens ?? null,
    latency_ms: input.stats?.elapsedMs ?? input.latencyMs ?? null,
    success: input.success,
    error_code: input.success ? null : input.errorCode ?? "request_failed",
  });

  if (error) throw error;
}

export async function loadUsageEvents(vault: UnlockedVault, options = { limit: 1000 }) {
  const { data, error } = await supabase
    .from("usage_events")
    .select("id,provider,model_ciphertext,model_nonce,prompt_tokens,completion_tokens,total_tokens,latency_ms,success,error_code,created_at")
    .eq("user_id", vault.userId)
    .order("created_at", { ascending: false })
    .limit(options.limit)
    .returns<StoredUsageEvent[]>();

  if (error) throw error;

  return Promise.all(
    data.map(async (row) => {
      const model =
        row.model_ciphertext && row.model_nonce
          ? await decryptString(
              vault.masterKey,
              {
                ciphertext: row.model_ciphertext,
                nonce: row.model_nonce,
              },
              `${usageEventAad(vault.userId, row.id)}:model`,
            ).catch(() => "Unknown model")
          : "Unknown model";

      return {
        id: row.id,
        provider: row.provider,
        model,
        promptTokens: row.prompt_tokens ?? 0,
        completionTokens: row.completion_tokens ?? 0,
        totalTokens: row.total_tokens ?? 0,
        latencyMs: row.latency_ms ?? 0,
        success: row.success,
        errorCode: row.error_code,
        createdAt: row.created_at,
      } satisfies UsageEventRecord;
    }),
  );
}
