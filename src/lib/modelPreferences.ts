import type { ProviderId } from "@/types/domain";

function hiddenModelsStorageKey(userId: string, provider: ProviderId) {
  return `salty:hidden-models:${userId}:${provider}`;
}

export function loadHiddenModelIds(userId: string, provider: ProviderId) {
  if (typeof window === "undefined") return [];

  try {
    const value = window.localStorage.getItem(hiddenModelsStorageKey(userId, provider));
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveHiddenModelIds(
  userId: string,
  provider: ProviderId,
  hiddenModelIds: string[],
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    hiddenModelsStorageKey(userId, provider),
    JSON.stringify([...new Set(hiddenModelIds)]),
  );
}
