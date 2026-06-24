import type { ProviderId, ProviderKeyState } from "@/types/domain";
import { decryptString, encryptString } from "./crypto";
import { ensureProfileId } from "./profiles";
import { supabase } from "./supabase";
import type { UnlockedVault } from "./vault";

type StoredProviderKey = {
  id: string;
  provider: ProviderId;
  encrypted_api_key: string;
  api_key_nonce: string;
  key_hint: string | null;
  is_default: boolean;
};

function providerKeyAad(userId: string, provider: ProviderId) {
  return `provider-key:${userId}:${provider}:v1`;
}

export async function loadEncryptedProviderKeys(vault: UnlockedVault) {
  const { data, error } = await supabase
    .from("user_provider_keys")
    .select("id,provider,encrypted_api_key,api_key_nonce,key_hint,is_default")
    .eq("user_id", vault.userId)
    .returns<StoredProviderKey[]>();

  if (error) throw error;

  const entries = await Promise.all(
    data.map(async (row) => {
      const apiKey = await decryptString(
        vault.masterKey,
        {
          ciphertext: row.encrypted_api_key,
          nonce: row.api_key_nonce,
        },
        providerKeyAad(vault.userId, row.provider),
      );

      return [row.provider, apiKey] as const;
    }),
  );

  return Object.fromEntries(entries) as Partial<Record<ProviderId, string>>;
}

export async function saveEncryptedProviderKey(
  vault: UnlockedVault,
  provider: ProviderId,
  apiKey: string,
) {
  await ensureProfileId(vault.userId);

  const encrypted = await encryptString(
    vault.masterKey,
    apiKey,
    providerKeyAad(vault.userId, provider),
  );

  const { data: existing, error: selectError } = await supabase
    .from("user_provider_keys")
    .select("id")
    .eq("user_id", vault.userId)
    .eq("provider", provider)
    .maybeSingle<{ id: string }>();

  if (selectError) throw selectError;

  const payload = {
    user_id: vault.userId,
    provider,
    encrypted_api_key: encrypted.ciphertext,
    api_key_nonce: encrypted.nonce,
    key_hint: keyHint(apiKey),
    is_default: true,
    updated_at: new Date().toISOString(),
  };

  const query = existing
    ? supabase.from("user_provider_keys").update(payload).eq("id", existing.id)
    : supabase.from("user_provider_keys").insert(payload);

  const { error } = await query;
  if (error) throw error;
}

export async function deleteEncryptedProviderKey(
  vault: UnlockedVault,
  provider: ProviderId,
) {
  const { error } = await supabase
    .from("user_provider_keys")
    .delete()
    .eq("user_id", vault.userId)
    .eq("provider", provider);

  if (error) throw error;
}

function keyHint(apiKey: string) {
  if (apiKey.length <= 8) return "saved";
  return `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}`;
}

export function emptyProviderKeyState(): Record<ProviderId, ProviderKeyState> {
  return {
    openai: { apiKey: "", hiddenModelIds: [], models: [], tested: false },
    deepseek: { apiKey: "", hiddenModelIds: [], models: [], tested: false },
  };
}
