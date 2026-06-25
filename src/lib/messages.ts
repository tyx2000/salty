import type {
  ChatAttachment,
  ChatMessage,
  MessageStatus,
  MessagePart,
  ProviderId,
  StoredAttachment,
  StoredMessage,
  StoredMessagePart,
} from "@/types/domain";
import {
  base64ToBytes,
  bytesToBase64,
  createAesKey,
  decryptBytes,
  decryptString,
  encryptBytes,
  encryptString,
  exportRawKey,
} from "./crypto";
import {
  attachmentBucket,
  flushPendingAttachmentStorageRemovals,
  removeAttachmentStoragePaths,
} from "./attachmentStorage";
import { loadConversationKey } from "./conversations";
import { normalizeAtomicDeleteRpcError } from "./supabaseRpcErrors";
import { supabase } from "./supabase";
import type { UnlockedVault } from "./vault";

export type PendingAttachment = {
  id: string;
  file: File;
  type: "image" | "file";
};

function messageAad(userId: string, messageId: string) {
  return `message:${userId}:${messageId}:v2`;
}

function partAad(userId: string, messageId: string, partIndex: number, type: string) {
  return `${messageAad(userId, messageId)}:part:${partIndex}:${type}`;
}

function attachmentAad(userId: string, attachmentId: string) {
  return `attachment:${userId}:${attachmentId}:v1`;
}

function attachmentContentAad(userId: string, attachmentId: string) {
  return `${attachmentAad(userId, attachmentId)}:content`;
}

function encryptedStoragePath(
  userId: string,
  conversationId: string,
  attachmentId: string,
) {
  return `users/${userId}/conversations/${conversationId}/attachments/${attachmentId}.bin`;
}

export async function loadMessages(vault: UnlockedVault, conversationId: string) {
  const conversationKey = await loadConversationKey(vault, conversationId);
  const { data: messageRows, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .returns<StoredMessage[]>();

  if (error) throw error;
  if (messageRows.length === 0) return [];

  const messageIds = messageRows.map((message) => message.id);
  const { data: partRows, error: partError } = await supabase
    .from("message_parts")
    .select("*")
    .in("message_id", messageIds)
    .order("order_index", { ascending: true })
    .returns<StoredMessagePart[]>();

  if (partError) throw partError;

  const partsByMessage = groupBy(partRows ?? [], "message_id");
  const decryptedPartsByMessage = new Map(
    await Promise.all(
      messageRows.map(async (row) => [
        row.id,
        await decryptParts(
          vault,
          conversationKey,
          row.id,
          partsByMessage.get(row.id) ?? [],
        ),
      ] as const),
    ),
  );
  const referencedAttachmentIds = [
    ...new Set(
      [...decryptedPartsByMessage.values()].flatMap(attachmentIdsFromParts),
    ),
  ];
  const attachmentRows = await loadAttachmentRows(messageIds, referencedAttachmentIds);
  const attachmentsByMessage = groupBy(attachmentRows, "message_id");
  const attachmentsById = new Map(attachmentRows.map((row) => [row.id, row]));

  return Promise.all(
    messageRows.map(async (row) => {
      const parts = decryptedPartsByMessage.get(row.id) ?? [];
      const attachmentRowsForMessage = [
        ...(attachmentsByMessage.get(row.id) ?? []),
        ...attachmentIdsFromParts(parts).flatMap((attachmentId) => {
          const attachment = attachmentsById.get(attachmentId);
          return attachment ? [attachment] : [];
        }),
      ];
      const attachments = await decryptAttachments(
        vault,
        conversationKey,
        distinctAttachments(attachmentRowsForMessage),
      );
      const responseStats = await decryptMessageResponseStats(
        vault,
        conversationKey,
        row,
      );

      return {
        id: row.id,
        role: row.role,
        status: normalizeStatus(row.status),
        provider: row.provider ?? undefined,
        model:
          row.model_ciphertext && row.model_nonce
            ? await decryptString(
                conversationKey,
                {
                  ciphertext: row.model_ciphertext,
                  nonce: row.model_nonce,
                },
                `${messageAad(vault.userId, row.id)}:model`,
              )
            : undefined,
        parts,
        attachments,
        ...(responseStats ? { responseStats } : {}),
        createdAt: row.created_at,
      } satisfies ChatMessage;
    }),
  );
}

export async function saveMessage(
  vault: UnlockedVault,
  message: ChatMessage,
  conversationId: string,
  provider: ProviderId,
  options: {
    model?: string;
    pendingAttachments?: PendingAttachment[];
  } = {},
) {
  const conversationKey = await loadConversationKey(vault, conversationId);
  const encryptedModel = options.model
    ? await encryptString(
        conversationKey,
        options.model,
        `${messageAad(vault.userId, message.id)}:model`,
      )
    : null;
  const encryptedMetadata = message.responseStats
    ? await encryptString(
        conversationKey,
        JSON.stringify({
          responseStats: message.responseStats,
        }),
        `${messageAad(vault.userId, message.id)}:metadata`,
      )
    : null;

  const partRows = await buildEncryptedPartRows(vault, conversationKey, message);

  const uploadedPendingStoragePaths: string[] = [];

  // Insert the message row first (FK constraint requires it), then parts.
  // If part insert fails, delete the message row to avoid orphans.
  const { error: messageError } = await supabase.from("messages").insert({
    id: message.id,
    conversation_id: conversationId,
    user_id: vault.userId,
    role: message.role,
    content_ciphertext: null,
    content_nonce: null,
    provider,
    model_ciphertext: encryptedModel?.ciphertext ?? null,
    model_nonce: encryptedModel?.nonce ?? null,
    encrypted_metadata: encryptedMetadata?.ciphertext ?? null,
    encrypted_metadata_nonce: encryptedMetadata?.nonce ?? null,
    status: message.status,
  });

  if (messageError) throw messageError;

  try {
    for (const attachment of options.pendingAttachments ?? []) {
      uploadedPendingStoragePaths.push(
        await uploadEncryptedAttachment(
          vault,
          conversationKey,
          conversationId,
          message.id,
          attachment,
        ),
      );
    }

    if (partRows.length > 0) {
      const { error: partError } = await supabase.from("message_parts").insert(partRows);
      if (partError) throw partError;
    }
  } catch (saveError) {
    try {
      const { error: deleteError } = await supabase
        .from("messages")
        .delete()
        .eq("id", message.id);
      if (deleteError) throw deleteError;
    } catch {
      // Preserve the original save error; cleanup can be retried by normal deletion flows.
    }
    await removeAttachmentStoragePaths(vault.userId, uploadedPendingStoragePaths);
    throw saveError;
  }
}

async function loadAttachmentRows(
  messageIds: string[],
  attachmentIds: string[],
) {
  const attachmentQueries = [
    supabase
      .from("attachments")
      .select("*")
      .in("message_id", messageIds)
      .returns<StoredAttachment[]>(),
  ];

  if (attachmentIds.length > 0) {
    attachmentQueries.push(
      supabase
        .from("attachments")
        .select("*")
        .in("id", attachmentIds)
        .returns<StoredAttachment[]>(),
    );
  }

  const results = await Promise.all(attachmentQueries);
  const attachmentError = results.find((result) => result.error)?.error;
  if (attachmentError) throw attachmentError;

  return distinctAttachments(results.flatMap((result) => result.data ?? []));
}

function attachmentIdsFromParts(parts: MessagePart[]) {
  return parts.flatMap((part) =>
    part.type === "image" || part.type === "file" ? [part.attachmentId] : [],
  );
}

function distinctAttachments(rows: StoredAttachment[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

export async function reassignAttachmentsToMessage(
  vault: UnlockedVault,
  conversationId: string,
  messageId: string,
  attachmentIds: string[],
) {
  const uniqueAttachmentIds = [...new Set(attachmentIds)];
  if (uniqueAttachmentIds.length === 0) return;

  const { error } = await supabase
    .from("attachments")
    .update({
      conversation_id: conversationId,
      message_id: messageId,
    })
    .in("id", uniqueAttachmentIds)
    .eq("user_id", vault.userId);

  if (error) throw error;
}

export async function updateMessageStatus(
  messageId: string,
  status: MessageStatus,
) {
  const { error } = await supabase
    .from("messages")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) throw error;
}

export async function updateMessageContent(
  vault: UnlockedVault,
  message: ChatMessage,
  conversationId: string,
  provider: ProviderId,
  options: {
    model?: string;
  } = {},
) {
  const conversationKey = await loadConversationKey(vault, conversationId);
  const encryptedModel = options.model
    ? await encryptString(
        conversationKey,
        options.model,
        `${messageAad(vault.userId, message.id)}:model`,
      )
    : null;
  const encryptedMetadata = message.responseStats
    ? await encryptString(
        conversationKey,
        JSON.stringify({
          responseStats: message.responseStats,
        }),
        `${messageAad(vault.userId, message.id)}:metadata`,
      )
    : null;

  const partRows = await buildEncryptedPartRows(vault, conversationKey, message);

  // Insert new parts first — if this fails, old parts are preserved.
  if (partRows.length > 0) {
    const { error: partError } = await supabase.from("message_parts").insert(partRows);
    if (partError) throw partError;
  }

  // Commit the message row update before deleting old parts so a crash
  // after this point leaves the message "completed" with renderable content.
  const { error: messageError } = await supabase
    .from("messages")
    .update({
      provider,
      model_ciphertext: encryptedModel?.ciphertext ?? null,
      model_nonce: encryptedModel?.nonce ?? null,
      encrypted_metadata: encryptedMetadata?.ciphertext ?? null,
      encrypted_metadata_nonce: encryptedMetadata?.nonce ?? null,
      status: message.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", message.id)
    .eq("conversation_id", conversationId)
    .eq("user_id", vault.userId);

  if (messageError) throw messageError;

  // Clean up placeholder parts only after the message row is committed.
  const newPartIds = partRows.map((row) => row.id);
  if (newPartIds.length > 0) {
    const { error: cleanupError } = await supabase
      .from("message_parts")
      .delete()
      .not("id", "in", `(${newPartIds.join(",")})`)
      .eq("message_id", message.id);
    return { cleanupFailed: Boolean(cleanupError) };
  }

  return { cleanupFailed: false };
}

export async function deleteMessages(
  vault: Pick<UnlockedVault, "userId">,
  messageIds: string[],
) {
  const uniqueMessageIds = [...new Set(messageIds)];
  if (uniqueMessageIds.length === 0) return;

  const { error } = await supabase.rpc("delete_messages_atomic", {
    p_message_ids: uniqueMessageIds,
  });
  if (error) throw normalizeAtomicDeleteRpcError(error, "delete messages");

  await flushPendingAttachmentStorageRemovals(vault.userId);
}

export async function encryptedAttachmentToDataUrl(
  vault: UnlockedVault,
  conversationId: string,
  attachment: ChatAttachment,
) {
  if (!attachment.storagePath) throw new Error("Attachment storage path is missing.");

  const conversationKey = await loadConversationKey(vault, conversationId);
  const { data: rows, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("id", attachment.id)
    .limit(1)
    .returns<StoredAttachment[]>();

  if (error) throw error;
  const row = rows[0];
  if (!row?.content_key_ciphertext || !row.content_key_nonce) {
    throw new Error("Attachment key is missing.");
  }

  const rawFileKey = await decryptString(
    conversationKey,
    {
      ciphertext: row.content_key_ciphertext,
      nonce: row.content_key_nonce,
    },
    `${attachmentAad(vault.userId, attachment.id)}:key`,
  );

  const fileKey = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(rawFileKey),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const { data: encryptedBlob, error: downloadError } = await supabase.storage
    .from(attachmentBucket)
    .download(attachment.storagePath);
  if (downloadError) throw downloadError;

  const encryptedPayload = JSON.parse(await encryptedBlob.text()) as {
    ciphertext: string;
    nonce: string;
  };
  const bytes = await decryptBytes(
    fileKey,
    encryptedPayload,
    attachmentContentAad(vault.userId, attachment.id),
  );

  return `data:${attachment.mimeType || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}

async function uploadEncryptedAttachment(
  vault: UnlockedVault,
  conversationKey: CryptoKey,
  conversationId: string,
  messageId: string,
  attachment: PendingAttachment,
): Promise<string> {
  const fileKey = await createAesKey();
  const fileBytes = await attachment.file.arrayBuffer();
  const encryptedFile = await encryptBytes(
    fileKey,
    fileBytes,
    attachmentContentAad(vault.userId, attachment.id),
  );
  const encryptedBlob = new Blob([JSON.stringify(encryptedFile)], {
    type: "application/octet-stream",
  });
  const storagePath = encryptedStoragePath(
    vault.userId,
    conversationId,
    attachment.id,
  );

  const { error: uploadError } = await supabase.storage
    .from(attachmentBucket)
    .upload(storagePath, encryptedBlob, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const [encryptedFileName, encryptedMimeType, encryptedFileKey] = await Promise.all([
    encryptString(
      conversationKey,
      attachment.file.name,
      `${attachmentAad(vault.userId, attachment.id)}:name`,
    ),
    encryptString(
      conversationKey,
      attachment.file.type || "application/octet-stream",
      `${attachmentAad(vault.userId, attachment.id)}:mime`,
    ),
    encryptString(
      conversationKey,
      await exportRawKey(fileKey),
      `${attachmentAad(vault.userId, attachment.id)}:key`,
    ),
  ]);

  const { error: attachmentError } = await supabase
    .from("attachments")
    .insert({
      id: attachment.id,
      user_id: vault.userId,
      conversation_id: conversationId,
      message_id: messageId,
      bucket: attachmentBucket,
      storage_path: storagePath,
      file_name_ciphertext: encryptedFileName.ciphertext,
      file_name_nonce: encryptedFileName.nonce,
      mime_type_ciphertext: encryptedMimeType.ciphertext,
      mime_type_nonce: encryptedMimeType.nonce,
      size_bytes: attachment.file.size,
      content_key_ciphertext: encryptedFileKey.ciphertext,
      content_key_nonce: encryptedFileKey.nonce,
    });

  if (attachmentError) {
    await removeAttachmentStoragePaths(vault.userId, [storagePath]);
    throw attachmentError;
  }

  return storagePath;
}

async function buildEncryptedPartRows(
  vault: UnlockedVault,
  conversationKey: CryptoKey,
  message: ChatMessage,
) {
  return Promise.all(
    message.parts.map(async (part, index) => {
      const encrypted = await encryptPart(vault, conversationKey, message.id, part, index);
      return {
        id: crypto.randomUUID(),
        message_id: message.id,
        type: part.type,
        order_index: index,
        content_ciphertext: encrypted.content?.ciphertext ?? null,
        content_nonce: encrypted.content?.nonce ?? null,
        data_ciphertext: encrypted.data?.ciphertext ?? null,
        data_nonce: encrypted.data?.nonce ?? null,
      };
    }),
  );
}

async function encryptPart(
  vault: UnlockedVault,
  conversationKey: CryptoKey,
  messageId: string,
  part: MessagePart,
  index: number,
) {
  const aad = partAad(vault.userId, messageId, index, part.type);

  if (part.type === "text" || part.type === "markdown") {
    return {
      content: await encryptString(conversationKey, part.text, `${aad}:content`),
    };
  }

  return {
    data: await encryptString(conversationKey, JSON.stringify(part), `${aad}:data`),
  };
}

async function decryptParts(
  vault: UnlockedVault,
  conversationKey: CryptoKey,
  messageId: string,
  rows: StoredMessagePart[],
) {
  return Promise.all(
    rows
      .sort((left, right) => left.order_index - right.order_index)
      .map(async (row) => {
        const aad = partAad(vault.userId, messageId, row.order_index, row.type);
        if (row.type === "text" || row.type === "markdown") {
          const text =
            row.content_ciphertext && row.content_nonce
              ? await decryptString(
                  conversationKey,
                  {
                    ciphertext: row.content_ciphertext,
                    nonce: row.content_nonce,
                  },
                  `${aad}:content`,
                )
              : "";
          return { type: row.type, text } as MessagePart;
        }

        if (!row.data_ciphertext || !row.data_nonce) {
          return { type: "text", text: "" } satisfies MessagePart;
        }

        return JSON.parse(
          await decryptString(
            conversationKey,
            {
              ciphertext: row.data_ciphertext,
              nonce: row.data_nonce,
            },
            `${aad}:data`,
          ),
        ) as MessagePart;
      }),
  );
}

async function decryptAttachments(
  vault: UnlockedVault,
  conversationKey: CryptoKey,
  rows: StoredAttachment[],
) {
  const entries = await Promise.all(
    rows.map(async (row) => {
      const fileName = await decryptString(
        conversationKey,
        {
          ciphertext: row.file_name_ciphertext,
          nonce: row.file_name_nonce,
        },
        `${attachmentAad(vault.userId, row.id)}:name`,
      );
      const mimeType =
        row.mime_type_ciphertext && row.mime_type_nonce
          ? await decryptString(
              conversationKey,
              {
                ciphertext: row.mime_type_ciphertext,
                nonce: row.mime_type_nonce,
              },
              `${attachmentAad(vault.userId, row.id)}:mime`,
            )
          : "application/octet-stream";

      return [
        row.id,
        {
          id: row.id,
          fileName,
          mimeType,
          sizeBytes: row.size_bytes ?? 0,
          storagePath: row.storage_path,
        } satisfies ChatAttachment,
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
}

async function decryptMessageResponseStats(
  vault: UnlockedVault,
  conversationKey: CryptoKey,
  row: StoredMessage,
) {
  if (!row.encrypted_metadata || !row.encrypted_metadata_nonce) return undefined;

  try {
    const metadata = JSON.parse(
      await decryptString(
        conversationKey,
        {
          ciphertext: row.encrypted_metadata,
          nonce: row.encrypted_metadata_nonce,
        },
        `${messageAad(vault.userId, row.id)}:metadata`,
      ),
    ) as { responseStats?: unknown };
    return normalizeResponseStats(metadata.responseStats);
  } catch {
    return undefined;
  }
}

function normalizeResponseStats(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const elapsedMs = numberValue(record.elapsedMs);
  if (elapsedMs === undefined) return undefined;

  const usageValue = record.usage;
  const usage =
    usageValue && typeof usageValue === "object"
      ? {
          promptTokens: numberValue(
            (usageValue as Record<string, unknown>).promptTokens,
          ),
          completionTokens: numberValue(
            (usageValue as Record<string, unknown>).completionTokens,
          ),
          totalTokens: numberValue(
            (usageValue as Record<string, unknown>).totalTokens,
          ),
        }
      : undefined;

  return {
    elapsedMs,
    ...(usage ? { usage } : {}),
  };
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeStatus(status: string): ChatMessage["status"] {
  if (
    status === "pending" ||
    status === "streaming" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    return status;
  }

  return "completed";
}

function groupBy<T extends Record<K, string | null>, K extends keyof T>(
  rows: T[],
  key: K,
) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    result.set(value, [...(result.get(value) ?? []), row]);
  }
  return result;
}
