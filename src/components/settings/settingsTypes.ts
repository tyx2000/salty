import type { ProviderId } from "@/types/domain";

/** Daily token usage data for the yearly profile heatmap. */
export type DailyUsage = {
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
export type ModelUsage = {
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

/** All usage aggregates required by profile and usage settings panels. */
export type UsageSummary = {
  /** Current year daily token heatmap data. */
  dailyUsage: DailyUsage;
  /** Per-model aggregate rows sorted by token usage. */
  modelUsage: ModelUsage[];
  /** Sum of all loaded token usage events. */
  totalTokens: number;
  /** Sum of all loaded response latencies. */
  totalLatency: number;
};
