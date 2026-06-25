import { supabase } from "./supabase";

export const attachmentBucket = "encrypted-attachments";

const pendingAttachmentStorageCleanupKey =
  "salty:pending-attachment-storage-cleanup";

export async function removeAttachmentStoragePaths(
  userId: string,
  storagePaths: string[],
) {
  const uniqueStoragePaths = [...new Set(storagePaths)].filter(Boolean);
  if (uniqueStoragePaths.length === 0) return;

  const queuedStoragePaths = loadQueuedAttachmentStoragePaths(userId);
  const pathsToRemove = [...new Set([...queuedStoragePaths, ...uniqueStoragePaths])];
  const removableStoragePaths = await unreferencedAttachmentStoragePaths(
    userId,
    pathsToRemove,
  );
  const referencedStoragePaths = pathsToRemove.filter(
    (storagePath) => !removableStoragePaths.includes(storagePath),
  );

  if (removableStoragePaths.length === 0) {
    queueAttachmentStoragePathsForRemoval(userId, referencedStoragePaths);
    return;
  }

  const { error } = await supabase.storage
    .from(attachmentBucket)
    .remove(removableStoragePaths);

  if (error) {
    queueAttachmentStoragePaths(userId, pathsToRemove);
    await recordPersistedAttachmentStorageRemovalFailure(
      userId,
      pathsToRemove,
      error.message,
    );
    return;
  }

  clearQueuedAttachmentStoragePaths(userId, removableStoragePaths);
  await clearPersistedAttachmentStorageRemovals(userId, removableStoragePaths);
  queueAttachmentStoragePathsForRemoval(userId, referencedStoragePaths);
}

export async function flushPendingAttachmentStorageRemovals(userId: string) {
  const queuedStoragePaths = [
    ...new Set([
      ...loadQueuedAttachmentStoragePaths(userId),
      ...(await loadPersistedAttachmentStorageRemovalPaths(userId)),
    ]),
  ];
  if (queuedStoragePaths.length === 0) return;

  await removeAttachmentStoragePaths(userId, queuedStoragePaths);
}

export function queueAttachmentStoragePathsForRemoval(
  userId: string,
  storagePaths: string[],
) {
  const uniqueStoragePaths = [...new Set(storagePaths)].filter(Boolean);
  if (uniqueStoragePaths.length === 0) return;

  queueAttachmentStoragePaths(userId, uniqueStoragePaths);
}

async function unreferencedAttachmentStoragePaths(
  userId: string,
  storagePaths: string[],
) {
  const { data, error } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("user_id", userId)
    .in("storage_path", storagePaths)
    .returns<Array<{ storage_path: string }>>();

  if (error) {
    queueAttachmentStoragePaths(userId, storagePaths);
    return [];
  }

  const referencedStoragePaths = new Set(
    (data ?? []).map((row) => row.storage_path),
  );
  return storagePaths.filter((storagePath) => !referencedStoragePaths.has(storagePath));
}

async function loadPersistedAttachmentStorageRemovalPaths(userId: string) {
  const { data, error } = await supabase
    .from("attachment_storage_deletions")
    .select("storage_path")
    .eq("user_id", userId)
    .eq("bucket", attachmentBucket)
    .eq("status", "pending")
    .returns<Array<{ storage_path: string }>>();

  if (error) return [];
  return [...new Set((data ?? []).map((row) => row.storage_path))];
}

async function clearPersistedAttachmentStorageRemovals(
  userId: string,
  storagePaths: string[],
) {
  if (storagePaths.length === 0) return;

  await supabase
    .from("attachment_storage_deletions")
    .delete()
    .eq("user_id", userId)
    .eq("bucket", attachmentBucket)
    .in("storage_path", storagePaths);
}

async function recordPersistedAttachmentStorageRemovalFailure(
  userId: string,
  storagePaths: string[],
  message: string,
) {
  if (storagePaths.length === 0) return;

  await supabase
    .from("attachment_storage_deletions")
    .update({
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("bucket", attachmentBucket)
    .in("storage_path", storagePaths);
}

function storageCleanupKey(userId: string) {
  return `${pendingAttachmentStorageCleanupKey}:${userId}`;
}

function loadQueuedAttachmentStoragePaths(userId: string) {
  if (typeof window === "undefined") return [];

  try {
    const value = window.localStorage.getItem(storageCleanupKey(userId));
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function queueAttachmentStoragePaths(userId: string, storagePaths: string[]) {
  if (typeof window === "undefined") return;

  const queuedStoragePaths = loadQueuedAttachmentStoragePaths(userId);
  window.localStorage.setItem(
    storageCleanupKey(userId),
    JSON.stringify([...new Set([...queuedStoragePaths, ...storagePaths])]),
  );
}

function clearQueuedAttachmentStoragePaths(userId: string, storagePaths: string[]) {
  if (typeof window === "undefined") return;

  const removedStoragePaths = new Set(storagePaths);
  const remainingStoragePaths = loadQueuedAttachmentStoragePaths(userId).filter(
    (storagePath) => !removedStoragePaths.has(storagePath),
  );

  if (remainingStoragePaths.length === 0) {
    window.localStorage.removeItem(storageCleanupKey(userId));
    return;
  }

  window.localStorage.setItem(
    storageCleanupKey(userId),
    JSON.stringify(remainingStoragePaths),
  );
}
