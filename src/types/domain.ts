export type ProviderId = "openai" | "deepseek";

export type ThinkingMode = "enabled" | "disabled";

export type ReasoningEffort = "default" | "minimal" | "low" | "medium" | "high";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type MessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "markdown"; text: string }
  | { type: "image"; attachmentId: string }
  | { type: "file"; attachmentId: string }
  | { type: "json"; value: unknown }
  | { type: "tool_call"; name: string; arguments: unknown }
  | { type: "tool_result"; name: string; result: unknown };

export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath?: string;
  dataUrl?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  status: MessageStatus;
  provider?: ProviderId;
  model?: string;
  parts: MessagePart[];
  attachments?: Record<string, ChatAttachment>;
  createdAt: string;
};

export type ProviderModel = {
  id: string;
  description?: string;
};

export type ProviderKeyState = {
  apiKey: string;
  hiddenModelIds: string[];
  models: ProviderModel[];
  tested: boolean;
};

export type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
};

export type VaultRecord = {
  id: string;
  user_id: string;
  kdf_name: string;
  kdf_params: {
    iterations: number;
    hash: "SHA-256";
  };
  salt: string;
  wrapped_master_key: string;
  wrapped_master_key_nonce: string;
  version: number;
};

export type StoredMessage = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: ChatRole;
  content_ciphertext: string | null;
  content_nonce: string | null;
  provider: ProviderId | null;
  model_ciphertext: string | null;
  model_nonce: string | null;
  status: string;
  created_at: string;
};

export type StoredMessagePart = {
  id: string;
  message_id: string;
  type: MessagePart["type"];
  content_ciphertext: string | null;
  content_nonce: string | null;
  data_ciphertext: string | null;
  data_nonce: string | null;
  order_index: number;
  created_at: string;
};

export type StoredAttachment = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  bucket: string;
  storage_path: string;
  file_name_ciphertext: string;
  file_name_nonce: string;
  mime_type_ciphertext: string | null;
  mime_type_nonce: string | null;
  size_bytes: number | null;
  content_key_ciphertext: string | null;
  content_key_nonce: string | null;
  encrypted_metadata: string | null;
  encrypted_metadata_nonce: string | null;
  created_at: string;
};
