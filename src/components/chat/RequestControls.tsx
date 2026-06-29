import type { RefObject } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Gauge,
} from "lucide-react";
import type { ReasoningEffort, ThinkingMode } from "@/types/domain";

/** Reasoning effort option displayed in the request controls menu. */
type ReasoningOption = {
  /** Stable value sent with chat requests. */
  value: ReasoningEffort;
  /** Human-readable menu label. */
  label: string;
};

/** Props for thinking mode and reasoning effort controls. */
type RequestControlsProps = {
  /** Whether controls should be disabled while a request is active. */
  busy: boolean;
  /** Selects the reasoning effort for subsequent requests. */
  onReasoningEffortChange: (value: ReasoningEffort) => void;
  /** Opens or closes the reasoning menu. */
  onToggleReasoningMenu: () => void;
  /** Toggles thinking mode on or off. */
  onToggleThinkingMode: () => void;
  /** Current reasoning effort selection. */
  reasoningEffort: ReasoningEffort;
  /** Available reasoning effort choices. */
  reasoningEffortOptions: ReasoningOption[];
  /** Whether the reasoning menu is visible. */
  reasoningMenuOpen: boolean;
  /** Menu container ref used for outside-click dismissal. */
  reasoningMenuRef: RefObject<HTMLDivElement | null>;
  /** Current thinking mode selection. */
  thinkingMode: ThinkingMode;
};

/** Displays request-level options next to the model picker. */
export function RequestControls({
  busy,
  onReasoningEffortChange,
  onToggleReasoningMenu,
  onToggleThinkingMode,
  reasoningEffort,
  reasoningEffortOptions,
  reasoningMenuOpen,
  reasoningMenuRef,
  thinkingMode,
}: RequestControlsProps) {
  const selectedReasoningLabel = reasoningEffortOptions.find(
    (option) => option.value === reasoningEffort,
  )?.label;

  return (
    <>
      <button
        aria-label="Toggle thinking mode"
        aria-pressed={thinkingMode === "enabled"}
        className={thinkingMode === "enabled" ? "request-toggle active" : "request-toggle"}
        disabled={busy}
        onClick={onToggleThinkingMode}
        title="Thinking"
        type="button"
      >
        <Brain size={14} />
        <span>Thinking</span>
      </button>
      <div className="request-picker" ref={reasoningMenuRef}>
        <button
          aria-expanded={reasoningMenuOpen}
          aria-haspopup="listbox"
          aria-label="Reasoning effort"
          className="request-picker-button"
          disabled={busy}
          onClick={onToggleReasoningMenu}
          type="button"
        >
          <Gauge size={14} />
          <span>Reasoning</span>
          <small>{selectedReasoningLabel}</small>
          <ChevronDown size={14} />
        </button>
        <div
          className={reasoningMenuOpen ? "request-menu open" : "request-menu"}
          role="listbox"
          aria-hidden={!reasoningMenuOpen}
        >
          {reasoningEffortOptions.map((option) => {
            const selected = option.value === reasoningEffort;
            return (
              <button
                aria-selected={selected}
                className={selected ? "request-menu-item active" : "request-menu-item"}
                key={option.value}
                onClick={() => onReasoningEffortChange(option.value)}
                role="option"
                type="button"
              >
                <span>{option.label}</span>
                {selected ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
