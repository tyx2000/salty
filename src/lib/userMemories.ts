import { ensureProfileId } from "./profiles";
import { supabase } from "./supabase";

export type UserMemoryStatus = "active" | "archived";

export type UserMemory = {
  id: string;
  content: string;
  status: UserMemoryStatus;
  createdAt: string;
  updatedAt: string;
};

type StoredUserMemory = {
  id: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function loadUserMemories(userId: string) {
  const { data, error } = await supabase
    .from("user_memories")
    .select("id,content,status,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .returns<StoredUserMemory[]>();

  if (error) {
    if (isMissingMemoriesTable(error)) return [];
    throw error;
  }

  return (data ?? []).map(normalizeMemory);
}

export async function createUserMemory(userId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Memory content is required.");

  await ensureProfileId(userId);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("user_memories")
    .insert({
      user_id: userId,
      content: trimmed,
      status: "active",
      updated_at: now,
    })
    .select("id,content,status,created_at,updated_at")
    .single<StoredUserMemory>();

  if (error) throw error;
  return normalizeMemory(data);
}

export async function updateUserMemory(
  userId: string,
  memoryId: string,
  updates: {
    content?: string;
    status?: UserMemoryStatus;
  },
) {
  const nextContent = updates.content?.trim();
  if (updates.content !== undefined && !nextContent) {
    throw new Error("Memory content is required.");
  }

  const patch = {
    ...(nextContent !== undefined ? { content: nextContent } : {}),
    ...(updates.status ? { status: updates.status } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("user_memories")
    .update(patch)
    .eq("id", memoryId)
    .eq("user_id", userId)
    .select("id,content,status,created_at,updated_at")
    .single<StoredUserMemory>();

  if (error) throw error;
  return normalizeMemory(data);
}

export async function deleteUserMemory(userId: string, memoryId: string) {
  const { error } = await supabase
    .from("user_memories")
    .delete()
    .eq("id", memoryId)
    .eq("user_id", userId);

  if (error) throw error;
}

function normalizeMemory(row: StoredUserMemory): UserMemory {
  return {
    id: row.id,
    content: row.content,
    status: row.status === "archived" ? "archived" : "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingMemoriesTable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .*user_memories.* does not exist/.test(message) ||
    /could not find.*user_memories/.test(message) ||
    /schema cache.*user_memories/.test(message)
  );
}
