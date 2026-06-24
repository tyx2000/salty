import type { User } from "@supabase/supabase-js";
import { importAesKeyFromBytes } from "./crypto";

export type UnlockedVault = {
  userId: string;
  masterKey: CryptoKey;
};

const encoder = new TextEncoder();

export async function autoUnlockVault(user: User) {
  const rawKey = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(
      [
        "salty-user-derived-master-key-v3",
        user.id,
        user.email ?? "",
        user.created_at ?? "",
      ].join("|"),
    ),
  );

  return {
    userId: user.id,
    masterKey: await importAesKeyFromBytes(rawKey),
  } satisfies UnlockedVault;
}

export function forgetVault(vault: UnlockedVault | null) {
  // CryptoKey material is not directly zeroizable in Web Crypto. Dropping references is the browser-safe path.
  return vault ? null : vault;
}
