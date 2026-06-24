export const env = {
  appName: import.meta.env.VITE_APP_NAME || "Salty",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
  kdfIterations: Number(import.meta.env.VITE_KDF_ITERATIONS || 600_000),
};

export function assertClientEnv() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill Supabase values.",
    );
  }
}
