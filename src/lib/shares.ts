import type { ChatMessage, SharedSnapshot } from "@/types/domain";
import {
  bytesToBase64,
  decryptString,
  encryptString,
  importAesKey,
  randomBytes,
  sha256Base64,
} from "./crypto";
import { supabase } from "./supabase";
import type { UnlockedVault } from "./vault";

export type ShareKind = SharedSnapshot["kind"];

type ShareRecord = {
  snapshot_ciphertext: string | null;
  snapshot_nonce: string | null;
};

export function parseShareRoute(pathname: string) {
  const match = /^\/share\/(conversation|turn)\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  return {
    kind: match[1] as ShareKind,
    token: decodeURIComponent(match[2]),
  };
}

export async function createConversationShare({
  conversationId,
  messages,
  title,
  vault,
}: {
  conversationId: string;
  messages: ChatMessage[];
  title: string;
  vault: UnlockedVault;
}) {
  const share = await encryptShareSnapshot({
    kind: "conversation",
    messages,
    title,
  });

  const { error } = await supabase.from("shared_conversations").insert({
    conversation_id: conversationId,
    user_id: vault.userId,
    share_token_hash: share.tokenHash,
    visibility: "link",
    snapshot_ciphertext: share.encrypted.ciphertext,
    snapshot_nonce: share.encrypted.nonce,
    snapshot_version: 1,
  });

  if (error) throw error;
  return share.url;
}

export async function createMessageTurnShare({
  assistantMessageId,
  conversationId,
  messages,
  title,
  userMessageId,
  vault,
}: {
  assistantMessageId: string;
  conversationId: string;
  messages: ChatMessage[];
  title: string;
  userMessageId: string;
  vault: UnlockedVault;
}) {
  const share = await encryptShareSnapshot({
    kind: "turn",
    messages,
    title,
  });

  const { error } = await supabase.from("shared_message_turns").insert({
    conversation_id: conversationId,
    user_id: vault.userId,
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId,
    share_token_hash: share.tokenHash,
    visibility: "link",
    snapshot_ciphertext: share.encrypted.ciphertext,
    snapshot_nonce: share.encrypted.nonce,
    snapshot_version: 1,
  });

  if (error) throw error;
  return share.url;
}

export async function loadSharedSnapshot(
  kind: ShareKind,
  token: string,
  secret: string,
) {
  const tokenHash = await shareTokenHash(token);
  const table =
    kind === "conversation" ? "shared_conversations" : "shared_message_turns";
  const { data, error } = await supabase
    .from(table)
    .select("snapshot_ciphertext,snapshot_nonce")
    .eq("share_token_hash", tokenHash)
    .limit(1)
    .returns<ShareRecord[]>();

  if (error) throw error;
  const record = data?.[0];
  if (!record?.snapshot_ciphertext || !record.snapshot_nonce) {
    throw new Error("This share link is unavailable or has expired.");
  }

  const key = await importAesKey(base64UrlToBase64(secret));
  const json = await decryptString(
    key,
    {
      ciphertext: record.snapshot_ciphertext,
      nonce: record.snapshot_nonce,
    },
    shareAad(kind, tokenHash),
  );
  return JSON.parse(json) as SharedSnapshot;
}

async function encryptShareSnapshot({
  kind,
  messages,
  title,
}: {
  kind: ShareKind;
  messages: ChatMessage[];
  title: string;
}) {
  const token = randomBase64Url(24);
  const secret = randomBase64Url(32);
  const tokenHash = await shareTokenHash(token);
  const key = await importAesKey(base64UrlToBase64(secret));
  const snapshot: SharedSnapshot = {
    kind,
    title,
    messages,
    createdAt: new Date().toISOString(),
  };
  const encrypted = await encryptString(
    key,
    JSON.stringify(snapshot),
    shareAad(kind, tokenHash),
  );

  return {
    encrypted,
    tokenHash,
    url: shareUrl(kind, token, secret),
  };
}

function shareUrl(kind: ShareKind, token: string, secret: string) {
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/share/${kind}/${encodeURIComponent(token)}#${secret}`;
}

function shareAad(kind: ShareKind, tokenHash: string) {
  return `share:${kind}:${tokenHash}:v1`;
}

function shareTokenHash(token: string) {
  return sha256Base64(`salty-share-token:v1:${token}`);
}

function randomBase64Url(length: number) {
  return base64ToBase64Url(bytesToBase64(randomBytes(length)));
}

function base64ToBase64Url(value: string) {
  return value.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBase64(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return normalized + padding;
}
