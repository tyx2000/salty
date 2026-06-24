import type {
  ChatAttachment,
  ChatMessage,
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
import { loadConversationKey } from "./conversations";
import { supabase } from "./supabase";
import type { UnlockedVault } from "./vault";

export const attachmentBucket = "encrypted-attachments";

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
  const [{ data: partRows, error: partError }, { data: attachmentRows, error: attachmentError }] =
    await Promise.all([
      supabase
        .from("message_parts")
        .select("*")
        .in("message_id", messageIds)
        .order("order_index", { ascending: true })
        .returns<StoredMessagePart[]>(),
      supabase
        .from("attachments")
        .select("*")
        .in("message_id", messageIds)
        .returns<StoredAttachment[]>(),
    ]);

  if (partError) throw partError;
  if (attachmentError) throw attachmentError;

  const partsByMessage = groupBy(partRows ?? [], "message_id");
  const attachmentsByMessage = groupBy(attachmentRows ?? [], "message_id");

  return Promise.all(
    messageRows.map(async (row) => {
      const attachments = await decryptAttachments(
        vault,
        conversationKey,
        attachmentsByMessage.get(row.id) ?? [],
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
        parts: await decryptParts(
          vault,
          conversationKey,
          row.id,
          partsByMessage.get(row.id) ?? [],
        ),
        attachments,
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
    existingAttachmentIds?: string[];
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
    status: message.status,
  });

  if (messageError) throw messageError;

  if (options.pendingAttachments?.length) {
    await Promise.all(
      options.pendingAttachments.map((attachment) =>
        uploadEncryptedAttachment(
          vault,
          conversationKey,
          conversationId,
          message.id,
          attachment,
        ),
      ),
    );
  }

  if (options.existingAttachmentIds?.length) {
    const { error: attachmentError } = await supabase
      .from("attachments")
      .update({
        conversation_id: conversationId,
        message_id: message.id,
      })
      .in("id", [...new Set(options.existingAttachmentIds)])
      .eq("user_id", vault.userId);

    if (attachmentError) throw attachmentError;
  }

  const partRows = await Promise.all(
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

  if (partRows.length > 0) {
    const { error: partError } = await supabase.from("message_parts").insert(partRows);
    if (partError) throw partError;
  }
}

export async function deleteMessages(messageIds: string[]) {
  const uniqueMessageIds = [...new Set(messageIds)];
  if (uniqueMessageIds.length === 0) return;

  const { data: attachmentRows, error: attachmentError } = await supabase
    .from("attachments")
    .select("storage_path")
    .in("message_id", uniqueMessageIds)
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
    .from("messages")
    .delete()
    .in("id", uniqueMessageIds);
  if (error) throw error;
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
) {
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

  const { error: attachmentError } = await supabase.from("attachments").insert({
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

  if (attachmentError) throw attachmentError;
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
