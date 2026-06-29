import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link, useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  Bell,
  Bot,
  Brush,
  Gauge,
  Keyboard,
  SlidersHorizontal,
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
import { loadUsageEvents, type UsageEventRecord } from "@/lib/usageEvents";
import type { UnlockedVault } from "@/lib/vault";
import { ProviderSettingsPanel } from "./ProviderSettingsPanel";

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
  { id: "personalization", label: "Personalization", icon: Bell },
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
        for (const providerId of providerIds) {
          const apiKey = savedKeys[providerId];
          const hiddenModelIds = loadHiddenModelIds(vault.userId, providerId);
          if (!apiKey) {
            setProviderKeys((current) => ({
              ...current,
              [providerId]: {
                ...current[providerId],
                hiddenModelIds,
              },
            }));
            continue;
          }

          setProviderKeys((current) => ({
            ...current,
            [providerId]: {
              ...current[providerId],
              apiKey,
              hiddenModelIds,
            },
          }));

          const result = await testProviderKey(providerId, apiKey);
          if (cancelled) return;
          setProviderKeys((current) => ({
            ...current,
            [providerId]: {
              apiKey,
              hiddenModelIds,
              models: result.models.map((model) =>
                enrichProviderModel(providerId, model),
              ),
              tested: true,
            },
          }));
        }
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

  const dailyUsage = useMemo(() => buildDailyUsage(usageEvents), [usageEvents]);
  const modelUsage = useMemo(() => buildModelUsage(usageEvents), [usageEvents]);
  const totalTokens = usageEvents.reduce((total, event) => total + event.totalTokens, 0);
  const totalLatency = usageEvents.reduce((total, event) => total + event.latencyMs, 0);

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
            dailyUsage={dailyUsage}
            loading={loadingUsage}
            totalTokens={totalTokens}
            usageError={usageError}
          />
        ) : null}
        {activeTab === "general" ? <GeneralPanel user={user} /> : null}
        {activeTab === "appearance" ? <AppearancePanel /> : null}
        {activeTab === "usage" ? (
          <UsagePanel
            loading={loadingUsage}
            modelUsage={modelUsage}
            totalLatency={totalLatency}
            totalTokens={totalTokens}
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
        {activeTab === "personalization" ? <PersonalizationPanel /> : null}
        {activeTab === "shortcut" ? <ShortcutPanel /> : null}
      </main>
    </section>
  );
}

/** Props for the profile activity heatmap panel. */
type ProfilePanelProps = {
  /** Current year daily token totals and heat levels. */
  dailyUsage: DailyUsage;
  /** Whether usage events are still loading. */
  loading: boolean;
  /** Total tokens across loaded usage events. */
  totalTokens: number;
  /** Usage loading error, if any. */
  usageError: string | null;
};

/** Displays account activity as a yearly token heatmap. */
function ProfilePanel({
  dailyUsage,
  loading,
  totalTokens,
  usageError,
}: ProfilePanelProps) {
  return (
    <section className="settings-panel">
      <header className="settings-panel-header">
        <div>
          <span>Profile</span>
          <h1>{dailyUsage.year} token activity</h1>
        </div>
        <strong>{formatNumber(totalTokens)} tokens</strong>
      </header>
      {usageError ? <div className="notice danger">{usageError}</div> : null}
      <div className="usage-heatmap" aria-label="Daily token usage">
        {loading ? (
          <span className="loading-shimmer-text">Loading usage...</span>
        ) : (
          dailyUsage.days.map((day) => (
            <div
              aria-label={`${day.label}: ${formatNumber(day.tokens)} tokens`}
              className={`heatmap-cell level-${day.level}`}
              key={day.key}
              title={`${day.label}: ${formatNumber(day.tokens)} tokens`}
            />
          ))
        )}
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span className={`heatmap-cell level-${level}`} key={level} />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}

/** Props for the model usage totals panel. */
type UsagePanelProps = {
  /** Whether usage events are still loading. */
  loading: boolean;
  /** Per-model aggregate usage rows. */
  modelUsage: ModelUsage[];
  /** Total response latency across loaded usage events. */
  totalLatency: number;
  /** Total tokens across loaded usage events. */
  totalTokens: number;
  /** Usage loading error, if any. */
  usageError: string | null;
};

/** Displays token, duration, and call totals grouped by provider/model. */
function UsagePanel({
  loading,
  modelUsage,
  totalLatency,
  totalTokens,
  usageError,
}: UsagePanelProps) {
  return (
    <section className="settings-panel">
      <header className="settings-panel-header">
        <div>
          <span>Usage</span>
          <h1>Model totals</h1>
        </div>
        <div className="usage-summary">
          <strong>{formatNumber(totalTokens)}</strong>
          <span>{formatDuration(totalLatency)}</span>
        </div>
      </header>
      {usageError ? <div className="notice danger">{usageError}</div> : null}
      {loading ? (
        <span className="loading-shimmer-text">Loading usage...</span>
      ) : (
        <div className="usage-table" role="table" aria-label="Token usage by model">
          <div className="usage-table-row header" role="row">
            <span>Model</span>
            <span>Tokens</span>
            <span>Duration</span>
            <span>Calls</span>
          </div>
          {modelUsage.length > 0 ? (
            modelUsage.map((row) => (
              <div className="usage-table-row" role="row" key={row.key}>
                <span>
                  <strong>{row.model}</strong>
                  <small>{row.provider}</small>
                </span>
                <span>{formatNumber(row.totalTokens)}</span>
                <span>{formatDuration(row.latencyMs)}</span>
                <span>{row.calls}</span>
              </div>
            ))
          ) : (
            <div className="usage-empty">No usage recorded.</div>
          )}
        </div>
      )}
    </section>
  );
}

/** Props for the provider settings panel. */
type ProviderPanelProps = {
  /** Provider-key loading error, if any. */
  providerError: string | null;
  /** Current provider key/model state keyed by provider. */
  providerKeys: Record<ProviderId, ProviderKeyState>;
  /** Applies provider key, model, and hidden-model changes. */
  updateProviderKey: (provider: ProviderId, state: ProviderKeyState) => void;
  /** Unlocked encryption vault used by provider setting cards. */
  vault: UnlockedVault;
};

/** Displays provider API-key panels for all supported providers. */
function ProviderPanel({
  providerError,
  providerKeys,
  updateProviderKey,
  vault,
}: ProviderPanelProps) {
  return (
    <section className="settings-panel">
      <header className="settings-panel-header">
        <div>
          <span>Provider</span>
          <h1>API keys</h1>
        </div>
      </header>
      {providerError ? <div className="notice danger">{providerError}</div> : null}
      <div className="provider-settings-list">
        {providerIds.map((providerId) => (
          <ProviderSettingsPanel
            key={providerId}
            onProviderKeyChange={updateProviderKey}
            provider={providerId}
            state={providerKeys[providerId]}
            vault={vault}
          />
        ))}
      </div>
    </section>
  );
}

/** Displays account identity fields. */
function GeneralPanel({ user }: { user: User }) {
  return (
    <section className="settings-panel compact">
      <header className="settings-panel-header">
        <div>
          <span>General</span>
          <h1>Account</h1>
        </div>
      </header>
      <dl className="settings-definition-list">
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>User ID</dt>
          <dd>{user.id}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Displays appearance settings placeholders. */
function AppearancePanel() {
  return (
    <section className="settings-panel compact">
      <header className="settings-panel-header">
        <div>
          <span>Appearance</span>
          <h1>Display</h1>
        </div>
      </header>
      <div className="settings-option-row">
        <span>Theme</span>
        <strong>System</strong>
      </div>
    </section>
  );
}

/** Displays personalization settings placeholders. */
function PersonalizationPanel() {
  return (
    <section className="settings-panel compact">
      <header className="settings-panel-header">
        <div>
          <span>Personalization</span>
          <h1>Preferences</h1>
        </div>
      </header>
      <div className="settings-option-row">
        <span>Memory</span>
        <strong>Off</strong>
      </div>
    </section>
  );
}

/** Displays keyboard shortcut reference rows. */
function ShortcutPanel() {
  return (
    <section className="settings-panel compact">
      <header className="settings-panel-header">
        <div>
          <span>Shortcut</span>
          <h1>Keyboard</h1>
        </div>
      </header>
      <div className="shortcut-list">
        <div>
          <span>Send</span>
          <kbd>Enter</kbd>
        </div>
        <div>
          <span>New line</span>
          <kbd>Shift Enter</kbd>
        </div>
      </div>
    </section>
  );
}

/** Daily token usage data for the yearly profile heatmap. */
type DailyUsage = {
  /** Calendar year represented by the heatmap. */
  year: number;
  /** One cell per day with token count and normalized color level. */
  days: Array<{
    key: string;
    label: string;
    tokens: number;
    level: number;
  }>;
};

/** Aggregated token and latency usage for one provider/model pair. */
type ModelUsage = {
  /** Stable provider:model key. */
  key: string;
  /** Provider that handled the calls. */
  provider: ProviderId;
  /** Model that handled the calls. */
  model: string;
  /** Sum of prompt and completion tokens. */
  totalTokens: number;
  /** Sum of response latency in milliseconds. */
  latencyMs: number;
  /** Number of recorded usage events. */
  calls: number;
};

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

function buildDailyUsage(events: UsageEventRecord[]): DailyUsage {
  const year = new Date().getFullYear();
  const start = startOfDay(new Date(year, 0, 1));
  const end = startOfDay(new Date(year, 11, 31));

  const tokensByDate = new Map<string, number>();
  for (const event of events) {
    const eventDate = new Date(event.createdAt);
    if (eventDate.getFullYear() !== year) continue;
    const key = dateKey(eventDate);
    tokensByDate.set(key, (tokensByDate.get(key) ?? 0) + event.totalTokens);
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

  return { year, days };
}

function buildModelUsage(events: UsageEventRecord[]) {
  const byModel = new Map<string, ModelUsage>();
  for (const event of events) {
    const key = `${event.provider}:${event.model}`;
    const current =
      byModel.get(key) ??
      ({
        key,
        provider: event.provider,
        model: event.model,
        totalTokens: 0,
        latencyMs: 0,
        calls: 0,
      } satisfies ModelUsage);
    current.totalTokens += event.totalTokens;
    current.latencyMs += event.latencyMs;
    current.calls += 1;
    byModel.set(key, current);
  }

  return [...byModel.values()].sort((left, right) => right.totalTokens - left.totalTokens);
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

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}
