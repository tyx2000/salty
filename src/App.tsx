import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
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
import {
  applyUserPreferences,
  colorSchemes,
  fontSizes,
  languageStyles,
  loadUserPreferences,
  saveUserPreferences,
  shortcutActions,
  type ShortcutActionId,
} from "./lib/userPreferences";
import { autoUnlockVault, forgetVault, type UnlockedVault } from "./lib/vault";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [vault, setVault] = useState<UnlockedVault | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [vaultError, setVaultError] = useState<string | null>(null);

  useEffect(() => {
    applyUserPreferences(loadUserPreferences());
  }, []);

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
  const navigate = useNavigate();
  const settingsMatch = location.pathname.match(/^\/settings(?:\/([^/]+))?$/);
  const knownAppRoute =
    location.pathname === "/" ||
    /^\/chat\/[^/]+$/.test(location.pathname) ||
    settingsMatch;

  useConfiguredShortcuts(navigate);

  if (!knownAppRoute) return <Navigate replace to="/" />;

  return (
    <>
      <ChatShell onLogout={onLogout} user={user} vault={vault} />
      {settingsMatch ? <SettingsPage user={user} vault={vault} /> : null}
    </>
  );
}

function useConfiguredShortcuts(navigate: ReturnType<typeof useNavigate>) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (isEditableShortcutTarget(event.target) && !hasCommandModifier(event)) {
        return;
      }

      const preferences = loadUserPreferences();
      const action = shortcutActions.find((item) => {
        const shortcut = preferences.shortcuts[item.id];
        return shortcut.enabled && shortcutMatches(event, shortcut.keys);
      });
      if (!action) return;

      event.preventDefault();
      runShortcutAction(action.id, navigate);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);
}

function runShortcutAction(
  actionId: ShortcutActionId,
  navigate: ReturnType<typeof useNavigate>,
) {
  const preferences = loadUserPreferences();

  if (actionId === "openSettings") {
    navigate("/settings");
    return;
  }

  if (actionId === "newChat") {
    navigate("/");
    window.dispatchEvent(new Event("salty:new-chat"));
    return;
  }

  if (actionId === "toggleColorScheme") {
    const currentIndex = colorSchemes.findIndex(
      (scheme) => scheme.id === preferences.colorScheme,
    );
    const nextScheme = colorSchemes[(currentIndex + 1) % colorSchemes.length];
    const nextPreferences = {
      ...preferences,
      colorScheme: nextScheme.id,
    };
    saveUserPreferences(nextPreferences);
    applyUserPreferences(nextPreferences);
    return;
  }

  if (actionId === "cycleLanguageStyle") {
    const currentIndex = languageStyles.findIndex(
      (style) => style.id === preferences.languageStyle,
    );
    const nextStyle =
      languageStyles[(currentIndex + 1) % languageStyles.length] ??
      languageStyles[0];
    saveUserPreferences({
      ...preferences,
      languageStyle: nextStyle.id,
    });
    return;
  }

  if (actionId === "increaseFontSize" || actionId === "decreaseFontSize") {
    const currentIndex = fontSizes.findIndex(
      (fontSize) => fontSize.id === preferences.fontSize,
    );
    const offset = actionId === "increaseFontSize" ? 1 : -1;
    const nextIndex = Math.max(
      0,
      Math.min(fontSizes.length - 1, currentIndex + offset),
    );
    const nextPreferences = {
      ...preferences,
      fontSize: fontSizes[nextIndex].id,
    };
    saveUserPreferences(nextPreferences);
    applyUserPreferences(nextPreferences);
    return;
  }

  if (actionId === "focusComposer") {
    document
      .querySelector<HTMLTextAreaElement>("[data-composer-input='true']")
      ?.focus();
  }
}

function shortcutMatches(event: KeyboardEvent, shortcutText: string) {
  const tokens = tokenizeShortcut(shortcutText);
  if (tokens.length === 0) return false;

  const modifiers = new Set(tokens.filter(isModifierToken));
  const keyTokens = tokens.filter((token) => !isModifierToken(token));
  const expectedKey = keyTokens[keyTokens.length - 1];

  if (!expectedKey) return false;
  if (modifiers.has("cmd") !== event.metaKey) return false;
  if (modifiers.has("ctrl") !== event.ctrlKey) return false;
  if (modifiers.has("alt") !== event.altKey) return false;

  const eventKey = normalizeShortcutToken(event.key);
  const shiftAllowedForPlus = expectedKey === "plus" && eventKey === "plus";
  if (modifiers.has("shift") !== event.shiftKey && !shiftAllowedForPlus) {
    return false;
  }

  return eventKey === expectedKey;
}

function tokenizeShortcut(shortcutText: string) {
  const trimmed = shortcutText.trim();
  if (!trimmed) return [];
  const pieces = /\s/.test(trimmed) ? trimmed.split(/\s+/) : trimmed.split("+");
  return pieces.map(normalizeShortcutToken).filter(Boolean);
}

function normalizeShortcutToken(token: string) {
  const value = token.trim().toLowerCase();
  if (!value) return "";
  if (value === "cmd" || value === "command" || value === "meta" || value === "⌘") {
    return "cmd";
  }
  if (value === "control") return "ctrl";
  if (value === "option") return "alt";
  if (value === "+" || value === "=" || value === "plus") return "plus";
  if (value === "-" || value === "_" || value === "minus") return "minus";
  if (value === "," || value === "comma") return "comma";
  if (value === "esc") return "escape";
  if (value === " ") return "space";
  return value.length === 1 ? value : value;
}

function isModifierToken(token: string) {
  return token === "cmd" || token === "ctrl" || token === "alt" || token === "shift";
}

function hasCommandModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
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
