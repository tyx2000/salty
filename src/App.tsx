import { useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { LogOut, ShieldCheck } from "lucide-react";
import { ChatShell } from "./components/ChatShell";
import { LoginPanel } from "./components/LoginPanel";
import { ShareViewer } from "./components/ShareViewer";
import { env } from "./lib/env";
import { parseShareRoute } from "./lib/shares";
import { supabase } from "./lib/supabase";
import { autoUnlockVault, forgetVault, type UnlockedVault } from "./lib/vault";

export default function App() {
  const shareRoute = parseShareRoute(window.location.pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [vault, setVault] = useState<UnlockedVault | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [vaultError, setVaultError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setVault(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const user = useMemo<User | null>(() => session?.user ?? null, [session]);

  useEffect(() => {
    let cancelled = false;

    async function unlock() {
      if (!user) return;
      setVaultError(null);

      try {
        const unlockedVault = await autoUnlockVault(user);
        if (!cancelled) setVault(unlockedVault);
      } catch (error) {
        if (!cancelled) {
          setVaultError(
            error instanceof Error
              ? error.message
              : "Unable to unlock encrypted data on this device.",
          );
        }
      }
    }

    unlock();

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleLogout() {
    setVault((current) => forgetVault(current));
    await supabase.auth.signOut({ scope: "local" });
  }

  if (loadingSession) {
    return <main className="centered">Loading secure session...</main>;
  }

  if (shareRoute) {
    return (
      <main className="app-shell share-active">
        <ShareViewer kind={shareRoute.kind} token={shareRoute.token} />
      </main>
    );
  }

  return (
    <main className={user && vault ? "app-shell chat-active" : "app-shell"}>
      {!(user && vault) ? (
        <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={20} />
          </div>
          <div>
            <strong>{env.appName}</strong>
            <span>Encrypted AI chat</span>
          </div>
        </div>
        {user ? (
          <button className="ghost-button" onClick={handleLogout}>
            <LogOut size={16} />
            Logout
          </button>
        ) : null}
        </header>
      ) : null}

      {!user ? <LoginPanel /> : null}

      {user && !vault ? (
        <section className="auto-unlock-state">
          <h1>{vaultError ? "Encrypted data unavailable" : "Preparing encrypted workspace"}</h1>
          <p>
            {vaultError ??
              "Creating or unlocking this browser's encrypted vault automatically."}
          </p>
        </section>
      ) : null}

      {user && vault ? (
        <ChatShell user={user} vault={vault} onLogout={handleLogout} />
      ) : null}
    </main>
  );
}
