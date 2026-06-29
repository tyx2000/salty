import type {
  FormEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import { Paperclip } from "lucide-react";
import type {
  ProviderId,
  ProviderModel,
  ReasoningEffort,
  ThinkingMode,
} from "@/types/domain";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { PendingAttachments } from "@/components/chat/PendingAttachments";
import { RequestControls } from "@/components/chat/RequestControls";
import { SendButton } from "@/components/chat/SendButton";

/** Model option displayed by the composer model picker. */
type AvailableModel = {
  /** Provider that owns the model id. */
  provider: ProviderId;
  /** Provider-returned model metadata shown in the menu. */
  model: ProviderModel;
};

/** Reasoning effort option displayed by the request control menu. */
type ReasoningOption = {
  /** Stable value sent with chat requests. */
  value: ReasoningEffort;
  /** Human-readable label shown in the menu. */
  label: string;
};

/** Props for the bottom message composer and request controls. */
type ComposerProps = {
  /** Models available after provider keys are tested. */
  availableModels: AvailableModel[];
  /** Whether a request is currently sending or streaming. */
  busy: boolean;
  /** Current textarea value. */
  draft: string;
  /** Hidden file input ref used by the attach button. */
  fileInputRef: RefObject<HTMLInputElement | null>;
  /** Whether the model picker menu is open. */
  modelMenuOpen: boolean;
  /** Model picker container ref used for outside-click dismissal. */
  modelMenuRef: RefObject<HTMLDivElement | null>;
  /** Adds files selected by the hidden file input. */
  onAddPendingFiles: (files: File[]) => void;
  /** Updates the controlled textarea value. */
  onDraftChange: (value: string) => void;
  /** Handles Enter-to-send keyboard behavior. */
  onDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Selects a provider:model value from the model picker. */
  onModelChange: (value: string) => void;
  /** Selects the reasoning effort for the next request. */
  onReasoningEffortChange: (value: ReasoningEffort) => void;
  /** Removes a pending file chip by index. */
  onRemovePendingFile: (index: number) => void;
  /** Submits the message form. */
  onSubmit: (event: FormEvent) => void;
  /** Shows or hides the model picker. */
  onToggleModelMenu: () => void;
  /** Shows or hides the reasoning picker. */
  onToggleReasoningMenu: () => void;
  /** Toggles thinking mode for the next request. */
  onToggleThinkingMode: () => void;
  /** Aborts the active streaming response. */
  onStopResponse: () => void;
  /** Files queued to be uploaded with the next user message. */
  pendingFiles: File[];
  /** Current reasoning effort selection. */
  reasoningEffort: ReasoningEffort;
  /** All reasoning effort choices shown in the menu. */
  reasoningEffortOptions: ReasoningOption[];
  /** Whether the reasoning menu is open. */
  reasoningMenuOpen: boolean;
  /** Reasoning menu container ref used for outside-click dismissal. */
  reasoningMenuRef: RefObject<HTMLDivElement | null>;
  /** Label shown in the collapsed model picker button. */
  selectedModelLabel: string;
  /** Selected provider:model value used to mark the active menu item. */
  selectedModelValue: string;
  /** Whether the selected model allows file/image attachments. */
  selectedSupportsAttachments: boolean;
  /** Current thinking mode selection. */
  thinkingMode: ThinkingMode;
};

/** Displays the chat input, attachment button, request controls, and send/stop button. */
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
  return (
    <form className="composer" onSubmit={onSubmit}>
      <div className="composer-box">
        <PendingAttachments
          files={pendingFiles}
          onRemove={onRemovePendingFile}
        />
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
          <ModelPicker
            availableModels={availableModels}
            modelMenuOpen={modelMenuOpen}
            modelMenuRef={modelMenuRef}
            onModelChange={onModelChange}
            onToggleModelMenu={onToggleModelMenu}
            selectedModelLabel={selectedModelLabel}
            selectedModelValue={selectedModelValue}
          />
          <RequestControls
            busy={busy}
            onReasoningEffortChange={onReasoningEffortChange}
            onToggleReasoningMenu={onToggleReasoningMenu}
            onToggleThinkingMode={onToggleThinkingMode}
            reasoningEffort={reasoningEffort}
            reasoningEffortOptions={reasoningEffortOptions}
            reasoningMenuOpen={reasoningMenuOpen}
            reasoningMenuRef={reasoningMenuRef}
            thinkingMode={thinkingMode}
          />
          <SendButton
            busy={busy}
            disabled={!busy && !draft.trim() && pendingFiles.length === 0}
            onStopResponse={onStopResponse}
          />
        </div>
      </div>
    </form>
  );
}
