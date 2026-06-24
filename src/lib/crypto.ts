import type { EncryptedPayload } from "@/types/domain";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToBase64(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function sha256Base64(value: string) {
  return bytesToBase64(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function deriveKeyEncryptionKey(
  password: string,
  saltBase64: string,
  iterations: number,
) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(saltBase64),
      iterations,
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createAesKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportRawKey(key: CryptoKey) {
  return bytesToBase64(await crypto.subtle.exportKey("raw", key));
}

export async function importAesKey(rawKeyBase64: string) {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(rawKeyBase64),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function importAesKeyFromBytes(rawKey: ArrayBuffer) {
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptString(
  key: CryptoKey,
  plaintext: string,
  aad: string,
): Promise<EncryptedPayload> {
  return encryptBytes(key, encoder.encode(plaintext), aad);
}

export async function encryptBytes(
  key: CryptoKey,
  plaintext: ArrayBuffer | Uint8Array,
  aad: string,
): Promise<EncryptedPayload> {
  const nonce = randomBytes(12);
  const bytes = plaintext instanceof Uint8Array ? plaintext : new Uint8Array(plaintext);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: encoder.encode(aad),
    },
    key,
    buffer,
  );

  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
  };
}

export async function decryptString(
  key: CryptoKey,
  payload: EncryptedPayload,
  aad: string,
) {
  const plaintext = await decryptBytes(key, payload, aad);
  return decoder.decode(plaintext);
}

export async function decryptBytes(
  key: CryptoKey,
  payload: EncryptedPayload,
  aad: string,
) {
  const ciphertext = base64ToBytes(payload.ciphertext);
  const buffer = ciphertext.buffer.slice(
    ciphertext.byteOffset,
    ciphertext.byteOffset + ciphertext.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(payload.nonce),
      additionalData: encoder.encode(aad),
    },
    key,
    buffer,
  );
}
