import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { ChatShell } from "./components/ChatShell";
import { LoginPanel } from "./components/LoginPanel";
import { SettingsPage } from "./components/SettingsPage";
import { ShareViewer } from "./components/ShareViewer";
import { env } from "./lib/env";
import type { ShareKind } from "./lib/shares";
import { supabase } from "./lib/supabase";
import { autoUnlockVault, forgetVault, type UnlockedVault } from "./lib/vault";

export default function App() {
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
    return (
      <main className="centered">
        <span className="loading-shimmer-text">Loading secure session...</span>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/share/:kind/:token" element={<ShareRoute />} />
      <Route
        path="/*"
        element={
          <AuthenticatedShell
            onLogout={handleLogout}
            user={user}
            vault={vault}
            vaultError={vaultError}
          >
            {(authedUser, unlockedVault) => (
              <AuthenticatedWorkspace
                onLogout={handleLogout}
                user={authedUser}
                vault={unlockedVault}
              />
            )}
          </AuthenticatedShell>
        }
      />
    </Routes>
  );
}

function AuthenticatedWorkspace({
  onLogout,
  user,
  vault,
}: {
  onLogout: () => void;
  user: User;
  vault: UnlockedVault;
}) {
  const location = useLocation();
  const settingsMatch = location.pathname.match(/^\/settings(?:\/([^/]+))?$/);
  const knownAppRoute =
    location.pathname === "/" ||
    /^\/chat\/[^/]+$/.test(location.pathname) ||
    settingsMatch;

  if (!knownAppRoute) return <Navigate replace to="/" />;

  return (
    <>
      <ChatShell onLogout={onLogout} user={user} vault={vault} />
      {settingsMatch ? <SettingsPage user={user} vault={vault} /> : null}
    </>
  );
}

function AuthenticatedShell({
  children,
  onLogout,
  user,
  vault,
  vaultError,
}: {
  children: (user: User, vault: UnlockedVault) => ReactNode;
  onLogout: () => void;
  user: User | null;
  vault: UnlockedVault | null;
  vaultError: string | null;
}) {
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
            <button className="ghost-button" onClick={onLogout}>
              <LogOut size={16} />
              Logout
            </button>
          ) : null}
        </header>
      ) : null}

      {!user ? <LoginPanel /> : null}

      {user && !vault ? (
        <section className="auto-unlock-state">
          <h1>
            {vaultError ? "Encrypted data unavailable" : "Preparing encrypted workspace"}
          </h1>
          <p>
            {vaultError ??
              "Creating or unlocking this browser's encrypted vault automatically."}
          </p>
        </section>
      ) : null}

      {user && vault ? children(user, vault) : null}
    </main>
  );
}

function ShareRoute() {
  const { kind, token } = useParams();
  if (!isShareKind(kind) || !token) return <Navigate replace to="/" />;

  return (
    <main className="app-shell share-active">
      <ShareViewer kind={kind} token={token} />
    </main>
  );
}

function isShareKind(value: string | undefined): value is ShareKind {
  return value === "conversation" || value === "turn";
}
