import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const aiProvider = pgEnum("ai_provider", ["openai", "deepseek"]);
export const conversationStatus = pgEnum("conversation_status", [
  "active",
  "archived",
  "deleted",
]);
export const messageRole = pgEnum("message_role", [
  "system",
  "user",
  "assistant",
  "tool",
]);
export const messageStatus = pgEnum("message_status", [
  "pending",
  "streaming",
  "completed",
  "failed",
  "cancelled",
]);
export const shareVisibility = pgEnum("share_visibility", [
  "private",
  "link",
  "public",
]);

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

// Mirrors auth.users without storing credentials in public tables.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayNameCiphertext: text("display_name_ciphertext"),
  displayNameNonce: text("display_name_nonce"),
  avatarUrlCiphertext: text("avatar_url_ciphertext"),
  avatarUrlNonce: text("avatar_url_nonce"),
  defaultProvider: aiProvider("default_provider").default("openai"),
  defaultModelCiphertext: text("default_model_ciphertext"),
  defaultModelNonce: text("default_model_nonce"),
  createdAt,
  updatedAt,
});

// Stores the user's wrapped data key. The plaintext master key never leaves the browser.
export const encryptedVaultKeys = pgTable(
  "encrypted_vault_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kdfName: text("kdf_name").notNull().default("PBKDF2-SHA-256"),
    kdfParams: jsonb("kdf_params").notNull(),
    salt: text("salt").notNull(),
    wrappedMasterKey: text("wrapped_master_key").notNull(),
    wrappedMasterKeyNonce: text("wrapped_master_key_nonce").notNull(),
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => ({
    userIdx: uniqueIndex("encrypted_vault_keys_user_idx").on(table.userId),
  }),
);

export const userProviderKeys = pgTable(
  "user_provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    provider: aiProvider("provider").notNull(),
    labelCiphertext: text("label_ciphertext"),
    labelNonce: text("label_nonce"),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    apiKeyNonce: text("api_key_nonce").notNull(),
    keyHint: text("key_hint"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt,
    updatedAt,
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => ({
    userProviderIdx: uniqueIndex("user_provider_keys_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
  }),
);

export const modelPresets = pgTable(
  "model_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    nameCiphertext: text("name_ciphertext").notNull(),
    nameNonce: text("name_nonce").notNull(),
    provider: aiProvider("provider").notNull(),
    modelCiphertext: text("model_ciphertext").notNull(),
    modelNonce: text("model_nonce").notNull(),
    temperature: numeric("temperature", { precision: 3, scale: 2 }),
    topP: numeric("top_p", { precision: 3, scale: 2 }),
    maxTokens: integer("max_tokens"),
    systemPromptCiphertext: text("system_prompt_ciphertext"),
    systemPromptNonce: text("system_prompt_nonce"),
    encryptedExtra: text("encrypted_extra"),
    encryptedExtraNonce: text("encrypted_extra_nonce"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    userIdx: index("model_presets_user_idx").on(table.userId),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    titleCiphertext: text("title_ciphertext"),
    titleNonce: text("title_nonce"),
    conversationKeyCiphertext: text("conversation_key_ciphertext").notNull(),
    conversationKeyNonce: text("conversation_key_nonce").notNull(),
    provider: aiProvider("provider").notNull().default("openai"),
    modelCiphertext: text("model_ciphertext"),
    modelNonce: text("model_nonce"),
    status: conversationStatus("status").notNull().default("active"),
    encryptedMetadata: text("encrypted_metadata"),
    encryptedMetadataNonce: text("encrypted_metadata_nonce"),
    createdAt,
    updatedAt,
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  },
  (table) => ({
    userStatusIdx: index("conversations_user_status_idx").on(
      table.userId,
      table.status,
    ),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    contentCiphertext: text("content_ciphertext"),
    contentNonce: text("content_nonce"),
    provider: aiProvider("provider"),
    modelCiphertext: text("model_ciphertext"),
    modelNonce: text("model_nonce"),
    status: messageStatus("status").notNull().default("completed"),
    parentMessageId: uuid("parent_message_id"),
    errorCiphertext: text("error_ciphertext"),
    errorNonce: text("error_nonce"),
    encryptedMetadata: text("encrypted_metadata"),
    encryptedMetadataNonce: text("encrypted_metadata_nonce"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    conversationCreatedIdx: index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    userIdx: index("messages_user_idx").on(table.userId),
  }),
);

export const messageParts = pgTable(
  "message_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    contentCiphertext: text("content_ciphertext"),
    contentNonce: text("content_nonce"),
    dataCiphertext: text("data_ciphertext"),
    dataNonce: text("data_nonce"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt,
  },
  (table) => ({
    messageOrderIdx: index("message_parts_message_order_idx").on(
      table.messageId,
      table.orderIndex,
    ),
  }),
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "cascade",
    }),
    bucket: text("bucket").notNull(),
    storagePath: text("storage_path").notNull(),
    fileNameCiphertext: text("file_name_ciphertext").notNull(),
    fileNameNonce: text("file_name_nonce").notNull(),
    mimeTypeCiphertext: text("mime_type_ciphertext"),
    mimeTypeNonce: text("mime_type_nonce"),
    sizeBytes: integer("size_bytes"),
    contentKeyCiphertext: text("content_key_ciphertext"),
    contentKeyNonce: text("content_key_nonce"),
    encryptedMetadata: text("encrypted_metadata"),
    encryptedMetadataNonce: text("encrypted_metadata_nonce"),
    createdAt,
  },
  (table) => ({
    userIdx: index("attachments_user_idx").on(table.userId),
    messageIdx: index("attachments_message_idx").on(table.messageId),
  }),
);

export const attachmentStorageDeletions = pgTable(
  "attachment_storage_deletions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull(),
    storagePath: text("storage_path").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    userStatusIdx: index("attachment_storage_deletions_user_status_idx").on(
      table.userId,
      table.status,
    ),
    userStoragePathIdx: uniqueIndex(
      "attachment_storage_deletions_user_storage_path_idx",
    ).on(table.userId, table.bucket, table.storagePath),
  }),
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    provider: aiProvider("provider").notNull(),
    modelCiphertext: text("model_ciphertext"),
    modelNonce: text("model_nonce"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    latencyMs: integer("latency_ms"),
    success: boolean("success").notNull(),
    errorCode: text("error_code"),
    createdAt,
  },
  (table) => ({
    userCreatedIdx: index("usage_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export const sharedConversations = pgTable(
  "shared_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    shareTokenHash: text("share_token_hash").notNull(),
    visibility: shareVisibility("visibility").notNull().default("private"),
    snapshotCiphertext: text("snapshot_ciphertext"),
    snapshotNonce: text("snapshot_nonce"),
    snapshotVersion: integer("snapshot_version").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt,
  },
  (table) => ({
    tokenIdx: uniqueIndex("shared_conversations_token_idx").on(
      table.shareTokenHash,
    ),
  }),
);

export const sharedMessageTurns = pgTable(
  "shared_message_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    userMessageId: uuid("user_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    assistantMessageId: uuid("assistant_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    shareTokenHash: text("share_token_hash").notNull(),
    visibility: shareVisibility("visibility").notNull().default("link"),
    snapshotCiphertext: text("snapshot_ciphertext").notNull(),
    snapshotNonce: text("snapshot_nonce").notNull(),
    snapshotVersion: integer("snapshot_version").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt,
  },
  (table) => ({
    tokenIdx: uniqueIndex("shared_message_turns_token_idx").on(
      table.shareTokenHash,
    ),
    userCreatedIdx: index("shared_message_turns_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);
