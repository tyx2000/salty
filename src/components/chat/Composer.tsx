import type {
  FormEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Gauge,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";
import type {
  ProviderId,
  ProviderModel,
  ReasoningEffort,
  ThinkingMode,
} from "@/types/domain";

type AvailableModel = {
  provider: ProviderId;
  model: ProviderModel;
};

type ReasoningOption = {
  value: ReasoningEffort;
  label: string;
};

type ComposerProps = {
  availableModels: AvailableModel[];
  busy: boolean;
  draft: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  modelMenuOpen: boolean;
  modelMenuRef: RefObject<HTMLDivElement | null>;
  onAddPendingFiles: (files: File[]) => void;
  onDraftChange: (value: string) => void;
  onDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onModelChange: (value: string) => void;
  onReasoningEffortChange: (value: ReasoningEffort) => void;
  onRemovePendingFile: (index: number) => void;
  onSubmit: (event: FormEvent) => void;
  onToggleModelMenu: () => void;
  onToggleReasoningMenu: () => void;
  onToggleThinkingMode: () => void;
  onStopResponse: () => void;
  pendingFiles: File[];
  reasoningEffort: ReasoningEffort;
  reasoningEffortOptions: ReasoningOption[];
  reasoningMenuOpen: boolean;
  reasoningMenuRef: RefObject<HTMLDivElement | null>;
  selectedModelLabel: string;
  selectedModelValue: string;
  selectedSupportsAttachments: boolean;
  thinkingMode: ThinkingMode;
};

export function Composer({
  availableModels,
  busy,
  draft,
  fileInputRef,
  modelMenuOpen,
  modelMenuRef,
  onAddPendingFiles,
  onDraftChange,
  onDraftKeyDown,
  onModelChange,
  onReasoningEffortChange,
  onRemovePendingFile,
  onSubmit,
  onToggleModelMenu,
  onToggleReasoningMenu,
  onToggleThinkingMode,
  onStopResponse,
  pendingFiles,
  reasoningEffort,
  reasoningEffortOptions,
  reasoningMenuOpen,
  reasoningMenuRef,
  selectedModelLabel,
  selectedModelValue,
  selectedSupportsAttachments,
  thinkingMode,
}: ComposerProps) {
  const selectedReasoningLabel = reasoningEffortOptions.find(
    (option) => option.value === reasoningEffort,
  )?.label;

  return (
    <form className="composer" onSubmit={onSubmit}>
      <div className="composer-box">
        {pendingFiles.length > 0 ? (
          <div className="pending-attachments">
            {pendingFiles.map((file, index) => (
              <div className="pending-attachment" key={`${file.name}:${file.size}:${index}`}>
                <span>{file.name}</span>
                <button
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onRemovePendingFile(index)}
                  type="button"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onDraftKeyDown}
          placeholder="Ask anything..."
          rows={3}
          value={draft}
        />
        <input
          multiple
          onChange={(event) => {
            onAddPendingFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
          ref={fileInputRef}
          type="file"
          hidden
        />
        <div className="composer-controls">
          <button
            aria-label="Attach files"
            className="attach-button"
            disabled={!selectedSupportsAttachments || busy}
            onClick={() => fileInputRef.current?.click()}
            title={
              selectedSupportsAttachments
                ? "Attach files"
                : "Selected model does not support attachments"
            }
            type="button"
          >
            <Paperclip size={15} />
          </button>
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
          <button
            className={busy ? "send-button stop-button" : "send-button"}
            disabled={!busy && !draft.trim() && pendingFiles.length === 0}
            onClick={busy ? onStopResponse : undefined}
            type={busy ? "button" : "submit"}
            aria-label={busy ? "Stop response" : "Send message"}
          >
            <span className="send-icon-stack" aria-hidden="true">
              <span className={busy ? "send-icon inactive" : "send-icon active"}>
                <Send size={16} />
              </span>
              <span className={busy ? "send-icon active" : "send-icon inactive"}>
                <Square size={13} fill="currentColor" />
              </span>
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
