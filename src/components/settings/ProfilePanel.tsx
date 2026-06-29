import type { User } from "@supabase/supabase-js";
import { UserRound } from "lucide-react";
import { formatNumber } from "./settingsFormat";
import type { DailyUsage } from "./settingsTypes";

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
  /** Authenticated user identity displayed at the top of the profile. */
  user: User;
};

/** Displays account identity and yearly token activity. */
export function ProfilePanel({
  dailyUsage,
  loading,
  totalTokens,
  usageError,
  user,
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
      <div className="profile-identity">
        <div className="settings-avatar">
          <UserRound size={18} />
        </div>
        <dl>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd>{user.id}</dd>
          </div>
        </dl>
      </div>
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
