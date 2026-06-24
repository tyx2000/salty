import type { ProviderId } from "@/types/domain";
import {
  createAesKey,
  decryptString,
  encryptString,
  exportRawKey,
  importAesKey,
} from "./crypto";
import { ensureProfileId } from "./profiles";
import { supabase } from "./supabase";
import type { UnlockedVault } from "./vault";

const attachmentBucket = "encrypted-attachments";

function conversationAad(userId: string, conversationId: string) {
  return `conversation:${userId}:${conversationId}:v1`;
}

export type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: string;
};

type StoredConversation = {
  id: string;
  title_ciphertext: string | null;
  title_nonce: string | null;
  conversation_key_ciphertext: string;
  conversation_key_nonce: string;
  updated_at: string;
  last_message_at: string | null;
  created_at: string;
};

export async function loadConversations(vault: UnlockedVault) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title_ciphertext,title_nonce,conversation_key_ciphertext,conversation_key_nonce,updated_at,last_message_at,created_at")
    .eq("user_id", vault.userId)
    .eq("status", "active")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .returns<StoredConversation[]>();

  if (error) throw error;

  return Promise.all(
    data.map(async (row) => ({
      id: row.id,
      title: await decryptConversationTitle(vault, row),
      updatedAt: row.last_message_at ?? row.updated_at ?? row.created_at,
    })),
  );
}

export async function createConversation(
  vault: UnlockedVault,
  title: string,
  provider: ProviderId,
  model: string,
) {
  await ensureProfileId(vault.userId);

  const id = crypto.randomUUID();
  const conversationKey = await createAesKey();
  const aad = conversationAad(vault.userId, id);
  const encryptedTitle = await encryptString(vault.masterKey, title, aad);
  const encryptedConversationKey = await encryptString(
    vault.masterKey,
    await exportRawKey(conversationKey),
    `${aad}:key`,
  );
  const encryptedModel = await encryptString(vault.masterKey, model, `${aad}:model`);

  const { error } = await supabase.from("conversations").insert({
    id,
    user_id: vault.userId,
    title_ciphertext: encryptedTitle.ciphertext,
    title_nonce: encryptedTitle.nonce,
    conversation_key_ciphertext: encryptedConversationKey.ciphertext,
    conversation_key_nonce: encryptedConversationKey.nonce,
    provider,
    model_ciphertext: encryptedModel.ciphertext,
    model_nonce: encryptedModel.nonce,
    status: "active",
    last_message_at: new Date().toISOString(),
  });

  if (error) throw error;
  return id;
}

export async function deleteConversation(conversationId: string) {
  const { data: attachmentRows, error: attachmentError } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("conversation_id", conversationId)
    .returns<Array<{ storage_path: string }>>();

  if (attachmentError) throw attachmentError;

  const storagePaths = [
    ...new Set((attachmentRows ?? []).map((row) => row.storage_path)),
  ];
  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(attachmentBucket)
      .remove(storagePaths);
    if (storageError) throw storageError;
  }

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  if (error) throw error;
}

export async function touchConversation(conversationId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("conversations")
    .update({
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", conversationId);

  if (error) throw error;
}

export async function refreshConversationLastMessageAt(conversationId: string) {
  const { data: latestMessages, error: latestError } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<Array<{ created_at: string }>>();

  if (latestError) throw latestError;

  const { error } = await supabase
    .from("conversations")
    .update({
      last_message_at: latestMessages?.[0]?.created_at ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (error) throw error;
}

export async function loadConversationKey(
  vault: UnlockedVault,
  conversationId: string,
) {
  const { data, error } = await supabase
    .from("conversations")
    .select("conversation_key_ciphertext,conversation_key_nonce")
    .eq("id", conversationId)
    .single<{
      conversation_key_ciphertext: string;
      conversation_key_nonce: string;
    }>();

  if (error) throw error;

  const rawKey = await decryptString(
    vault.masterKey,
    {
      ciphertext: data.conversation_key_ciphertext,
      nonce: data.conversation_key_nonce,
    },
    `${conversationAad(vault.userId, conversationId)}:key`,
  );

  return importAesKey(rawKey);
}

async function decryptConversationTitle(
  vault: UnlockedVault,
  row: StoredConversation,
) {
  if (!row.title_ciphertext || !row.title_nonce) return "Untitled conversation";

  try {
    return await decryptString(
      vault.masterKey,
      {
        ciphertext: row.title_ciphertext,
        nonce: row.title_nonce,
      },
      conversationAad(vault.userId, row.id),
    );
  } catch {
    return "Unable to decrypt title";
  }
}
