import type { RefObject } from "react";
import {
  Check,
  ChevronDown,
} from "lucide-react";
import type { ProviderId, ProviderModel } from "@/types/domain";

/** Model option displayed by the picker menu. */
type AvailableModel = {
  /** Provider that should handle requests for this model. */
  provider: ProviderId;
  /** Model metadata shown in the list. */
  model: ProviderModel;
};

/** Props for the composer model picker. */
type ModelPickerProps = {
  /** Selectable models from all tested providers. */
  availableModels: AvailableModel[];
  /** Whether the model menu is visible. */
  modelMenuOpen: boolean;
  /** Menu container ref used for outside-click dismissal. */
  modelMenuRef: RefObject<HTMLDivElement | null>;
  /** Called with provider:model when a model is selected. */
  onModelChange: (value: string) => void;
  /** Opens or closes the model menu. */
  onToggleModelMenu: () => void;
  /** Button label for the selected model. */
  selectedModelLabel: string;
  /** Selected provider:model value used to mark the active item. */
  selectedModelValue: string;
};

/** Displays the current model and a selectable model list. */
export function ModelPicker({
  availableModels,
  modelMenuOpen,
  modelMenuRef,
  onModelChange,
  onToggleModelMenu,
  selectedModelLabel,
  selectedModelValue,
}: ModelPickerProps) {
  return (
    <div className="model-picker" ref={modelMenuRef}>
      <button
        aria-expanded={modelMenuOpen}
        aria-haspopup="listbox"
        aria-label="Available model"
        className="model-picker-button"
        disabled={availableModels.length === 0}
        onClick={onToggleModelMenu}
        type="button"
      >
        <span>{selectedModelLabel}</span>
        <ChevronDown size={14} />
      </button>
      <div
        className={modelMenuOpen ? "model-menu open" : "model-menu"}
        role="listbox"
        aria-hidden={!modelMenuOpen}
      >
        {availableModels.map((item) => {
          const value = `${item.provider}:${item.model.id}`;
          const selected = value === selectedModelValue;
          return (
            <button
              aria-selected={selected}
              className={selected ? "model-menu-item active" : "model-menu-item"}
              key={value}
              onClick={() => onModelChange(value)}
              role="option"
              type="button"
            >
              <span>{item.model.id}</span>
              {item.model.description ? (
                <small>{item.model.description}</small>
              ) : null}
              {selected ? <Check size={14} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
