import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link, useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  Bot,
  Brush,
  Gauge,
  Keyboard,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { ProviderId, ProviderKeyState } from "@/types/domain";
import { testProviderKey } from "@/lib/chatApi";
import { enrichProviderModel } from "@/lib/modelCapabilities";
import {
  loadHiddenModelIds,
  saveHiddenModelIds,
} from "@/lib/modelPreferences";
import {
  emptyProviderKeyState,
  loadEncryptedProviderKeys,
} from "@/lib/providerKeys";
import { saveCloudUserPreferences } from "@/lib/cloudUserPreferences";
import { loadUsageEvents, type UsageEventRecord } from "@/lib/usageEvents";
import {
  applyUserPreferences,
  loadUserPreferences,
  saveUserPreferences,
  type UserPreferences,
} from "@/lib/userPreferences";
import type { UnlockedVault } from "@/lib/vault";
import { AppearancePanel } from "./settings/AppearancePanel";
import { GeneralPanel } from "./settings/GeneralPanel";
import { PersonalizationPanel } from "./settings/PersonalizationPanel";
import { ProfilePanel } from "./settings/ProfilePanel";
import { ProviderPanel } from "./settings/ProviderPanel";
import { ShortcutPanel } from "./settings/ShortcutPanel";
import { UsagePanel } from "./settings/UsagePanel";
import type { ModelUsage, UsageSummary } from "./settings/settingsTypes";

/** Props for the account settings route. */
type SettingsPageProps = {
  /** Authenticated user shown in profile/general settings. */
  user: User;
  /** Unlocked encryption vault used to load usage and provider settings. */
  vault: UnlockedVault;
};

type SettingsTab =
  | "profile"
  | "general"
  | "appearance"
  | "usage"
  | "provider"
  | "personalization"
  | "shortcut";

/** Tab metadata used to render the vertical settings navigation. */
const tabs: Array<{ id: SettingsTab; label: string; icon: typeof UserRound }> = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", icon: Brush },
  { id: "usage", label: "Usage", icon: Gauge },
  { id: "provider", label: "Provider", icon: Bot },
  { id: "personalization", label: "Personalization", icon: Sparkles },
  { id: "shortcut", label: "Shortcut", icon: Keyboard },
];

const providerIds: ProviderId[] = ["openai", "deepseek"];

/** Displays the settings layout and routes each settings subpath to its panel. */
export function SettingsPage({ user, vault }: SettingsPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = settingsTabFromPath(location.pathname);
  const returnTo = settingsReturnPath(location.state);
  const routeState = useMemo(() => ({ returnTo }), [returnTo]);
  const [usageEvents, setUsageEvents] = useState<UsageEventRecord[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [providerKeys, setProviderKeys] =
    useState<Record<ProviderId, ProviderKeyState>>(emptyProviderKeyState);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(loadUserPreferences);

  useEffect(() => {
    function handlePreferenceUpdate(event: Event) {
      const detail = (event as CustomEvent<UserPreferences>).detail;
      setPreferences(detail ?? loadUserPreferences());
    }

    window.addEventListener(
      "salty:user-preferences-updated",
      handlePreferenceUpdate,
    );
    return () =>
      window.removeEventListener(
        "salty:user-preferences-updated",
        handlePreferenceUpdate,
      );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUsage() {
      setLoadingUsage(true);
      setUsageError(null);
      try {
        const rows = await loadUsageEvents(vault, { limit: 1500 });
        if (!cancelled) setUsageEvents(rows);
      } catch (error) {
        if (!cancelled) {
          setUsageError(
            error instanceof Error ? error.message : "Unable to load usage.",
          );
        }
      } finally {
        if (!cancelled) setLoadingUsage(false);
      }
    }

    loadUsage();
    return () => {
      cancelled = true;
    };
  }, [vault]);

  useEffect(() => {
    let cancelled = false;

    async function loadProviderKeys() {
      setProviderError(null);
      try {
        const savedKeys = await loadEncryptedProviderKeys(vault);
        const providerEntries = providerIds.map((providerId) => ({
          apiKey: savedKeys[providerId],
          hiddenModelIds: loadHiddenModelIds(vault.userId, providerId),
          providerId,
        }));
        setProviderKeys((current) => {
          const next = { ...current };
          for (const { apiKey, hiddenModelIds, providerId } of providerEntries) {
            next[providerId] = {
              ...next[providerId],
              apiKey: apiKey ?? "",
              hiddenModelIds,
            };
          }
          return next;
        });

        const testedProviders = await Promise.all(
          providerEntries.map(async ({ apiKey, hiddenModelIds, providerId }) => {
            if (!apiKey) return null;
            const result = await testProviderKey(providerId, apiKey);
            return {
              apiKey,
              hiddenModelIds,
              models: result.models.map((model) =>
                enrichProviderModel(providerId, model),
              ),
              providerId,
            };
          }),
        );
        if (cancelled) return;

        setProviderKeys((current) => {
          const next = { ...current };
          for (const entry of testedProviders) {
            if (!entry) continue;
            next[entry.providerId] = {
              apiKey: entry.apiKey,
              hiddenModelIds: entry.hiddenModelIds,
              models: entry.models,
              tested: true,
            };
          }
          return next;
        });
      } catch (error) {
        if (!cancelled) {
          setProviderError(
            error instanceof Error ? error.message : "Unable to load providers.",
          );
        }
      }
    }

    loadProviderKeys();
    return () => {
      cancelled = true;
    };
  }, [vault]);

  const usageSummary = useMemo(() => buildUsageSummary(usageEvents), [usageEvents]);

  function selectTab(tab: SettingsTab) {
    navigate(tab === "profile" ? "/settings" : `/settings/${tab}`, {
      state: routeState,
    });
  }

  function updateProviderKey(providerId: ProviderId, state: ProviderKeyState) {
    saveHiddenModelIds(vault.userId, providerId, state.hiddenModelIds);
    setProviderKeys((current) => ({
      ...current,
      [providerId]: state,
    }));
  }

  function updatePreferences(nextPreferences: UserPreferences) {
    setPreferences(nextPreferences);
    saveUserPreferences(nextPreferences);
    void saveCloudUserPreferences(user.id, nextPreferences).catch((error) => {
      console.warn("Unable to save cloud preferences.", error);
    });
    applyUserPreferences(nextPreferences);
  }

  return (
    <section className="settings-page">
      <aside className="settings-sidebar">
        <Link className="settings-back-link" to={returnTo}>
          <ArrowLeft size={16} />
          Chat
        </Link>
        <div className="settings-account">
          <div className="settings-avatar">
            <UserRound size={18} />
          </div>
          <div>
            <strong>{user.email}</strong>
            <span>{user.id}</span>
          </div>
        </div>
        <nav className="settings-tablist" aria-label="Settings sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={
                  activeTab === tab.id ? "settings-tab active" : "settings-tab"
                }
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                type="button"
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="settings-main">
        {activeTab === "profile" ? (
          <ProfilePanel
            dailyUsage={usageSummary.dailyUsage}
            loading={loadingUsage}
            totalTokens={usageSummary.totalTokens}
            usageError={usageError}
            user={user}
          />
        ) : null}
        {activeTab === "general" ? <GeneralPanel /> : null}
        {activeTab === "appearance" ? (
          <AppearancePanel
            preferences={preferences}
            updatePreferences={updatePreferences}
          />
        ) : null}
        {activeTab === "usage" ? (
          <UsagePanel
            loading={loadingUsage}
            modelUsage={usageSummary.modelUsage}
            totalLatency={usageSummary.totalLatency}
            totalTokens={usageSummary.totalTokens}
            usageError={usageError}
          />
        ) : null}
        {activeTab === "provider" ? (
          <ProviderPanel
            providerError={providerError}
            providerKeys={providerKeys}
            updateProviderKey={updateProviderKey}
            vault={vault}
          />
        ) : null}
        {activeTab === "personalization" ? (
          <PersonalizationPanel
            preferences={preferences}
            updatePreferences={updatePreferences}
            userId={user.id}
          />
        ) : null}
        {activeTab === "shortcut" ? (
          <ShortcutPanel
            preferences={preferences}
            updatePreferences={updatePreferences}
          />
        ) : null}
      </main>
    </section>
  );
}

function isSettingsTab(value: string | undefined): value is SettingsTab {
  return tabs.some((tab) => tab.id === value);
}

function settingsTabFromPath(pathname: string): SettingsTab {
  const tab = pathname.match(/^\/settings\/([^/]+)$/)?.[1];
  return isSettingsTab(tab) ? tab : "profile";
}

function settingsReturnPath(state: unknown) {
  if (
    state &&
    typeof state === "object" &&
    "returnTo" in state &&
    typeof state.returnTo === "string" &&
    (state.returnTo === "/" || /^\/chat\/[^/]+$/.test(state.returnTo))
  ) {
    return state.returnTo;
  }

  return "/";
}

function buildUsageSummary(events: UsageEventRecord[]): UsageSummary {
  const year = new Date().getFullYear();
  const start = startOfDay(new Date(year, 0, 1));
  const end = startOfDay(new Date(year, 11, 31));
  const tokensByDate = new Map<string, number>();
  const byModel = new Map<string, ModelUsage>();
  let totalTokens = 0;
  let totalLatency = 0;

  for (const event of events) {
    totalTokens += event.totalTokens;
    totalLatency += event.latencyMs;

    const eventDate = new Date(event.createdAt);
    if (eventDate.getFullYear() === year) {
      const key = dateKey(eventDate);
      tokensByDate.set(key, (tokensByDate.get(key) ?? 0) + event.totalTokens);
    }

    const modelKey = `${event.provider}:${event.model}`;
    const modelUsage =
      byModel.get(modelKey) ??
      ({
        key: modelKey,
        provider: event.provider,
        model: event.model,
        totalTokens: 0,
        latencyMs: 0,
        calls: 0,
      } satisfies ModelUsage);
    modelUsage.totalTokens += event.totalTokens;
    modelUsage.latencyMs += event.latencyMs;
    modelUsage.calls += 1;
    byModel.set(modelKey, modelUsage);
  }

  const values = Array.from(tokensByDate.values());
  const max = Math.max(0, ...values);
  const days = [];
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const key = dateKey(date);
    const tokens = tokensByDate.get(key) ?? 0;
    days.push({
      key,
      label: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      tokens,
      level: heatmapLevel(tokens, max),
    });
  }

  return {
    dailyUsage: { year, days },
    modelUsage: [...byModel.values()].sort(
      (left, right) => right.totalTokens - left.totalTokens,
    ),
    totalLatency,
    totalTokens,
  };
}

function heatmapLevel(tokens: number, max: number) {
  if (tokens <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((tokens / max) * 4));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
