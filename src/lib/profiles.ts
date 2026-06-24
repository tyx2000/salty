import { supabase } from "./supabase";

export async function ensureProfileId(userId: string) {
  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}
