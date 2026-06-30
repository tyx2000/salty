import { ensureProfileId } from "./profiles";
import { supabase } from "./supabase";
import {
  normalizeUserPreferences,
  type UserPreferences,
} from "./userPreferences";

type StoredUserPreferences = {
  preferences: unknown;
  updated_at?: string | null;
};

type PreferenceChangePayload = {
  new: {
    preferences?: unknown;
  };
};

export async function loadCloudUserPreferences(userId: string) {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("preferences,updated_at")
    .eq("user_id", userId)
    .maybeSingle<StoredUserPreferences>();

  if (error) {
    if (isMissingPreferencesTable(error)) return null;
    throw error;
  }

  return data?.preferences ? normalizeUserPreferences(data.preferences) : null;
}

export async function saveCloudUserPreferences(
  userId: string,
  preferences: UserPreferences,
) {
  await ensureProfileId(userId);

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      preferences: normalizeUserPreferences(preferences),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    if (isMissingPreferencesTable(error)) return;
    throw error;
  }
}

export function subscribeCloudUserPreferences(
  userId: string,
  onPreferences: (preferences: UserPreferences) => void,
) {
  const channel = supabase
    .channel(`user-preferences:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_preferences",
        filter: `user_id=eq.${userId}`,
      },
      (payload: PreferenceChangePayload) => {
        if (!payload.new.preferences) return;
        onPreferences(normalizeUserPreferences(payload.new.preferences));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function isMissingPreferencesTable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .*user_preferences.* does not exist/.test(message) ||
    /could not find.*user_preferences/.test(message) ||
    /schema cache.*user_preferences/.test(message)
  );
}
