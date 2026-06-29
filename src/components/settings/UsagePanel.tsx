import { formatDuration, formatNumber } from "./settingsFormat";
import type { ModelUsage } from "./settingsTypes";

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
export function UsagePanel({
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
