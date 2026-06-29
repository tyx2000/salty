import type {
  FormEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import { useState } from "react";
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
  /** Hidden file input ref used by the attach button. */
  fileInputRef: RefObject<HTMLInputElement | null>;
  /** Whether the model picker menu is open. */
  modelMenuOpen: boolean;
  /** Model picker container ref used for outside-click dismissal. */
  modelMenuRef: RefObject<HTMLDivElement | null>;
  /** Handles Enter-to-send keyboard behavior. */
  onDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Selects a provider:model value from the model picker. */
  onModelChange: (value: string) => void;
  /** Removes the currently queued text draft. */
  onDeleteQueuedDraft: () => void;
  /** Stores text for the next turn while a response is active. */
  onQueueDraft: (draft: string) => boolean;
  /** Selects the reasoning effort for the next request. */
  onReasoningEffortChange: (value: ReasoningEffort) => void;
  /** Stops the active response so queued text can send next. */
  onSteerQueuedDraft: () => void;
  /** Submits current local draft/files and returns true when Composer should clear them. */
  onSubmit: (payload: { draft: string; files: File[] }) => Promise<boolean>;
  /** Shows or hides the model picker. */
  onToggleModelMenu: () => void;
  /** Shows or hides the reasoning picker. */
  onToggleReasoningMenu: () => void;
  /** Toggles thinking mode for the next request. */
  onToggleThinkingMode: () => void;
  /** Aborts the active streaming response. */
  onStopResponse: () => void;
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
  /** Text waiting to send after the active response finishes. */
  queuedDraft: string | null;
};

/** Displays the chat input, attachment button, request controls, and send/stop button. */
export function Composer({
  availableModels,
  busy,
  fileInputRef,
  modelMenuOpen,
  modelMenuRef,
  onDraftKeyDown,
  onModelChange,
  onDeleteQueuedDraft,
  onQueueDraft,
  onReasoningEffortChange,
  onSteerQueuedDraft,
  onSubmit,
  onToggleModelMenu,
  onToggleReasoningMenu,
  onToggleThinkingMode,
  onStopResponse,
  reasoningEffort,
  reasoningEffortOptions,
  reasoningMenuOpen,
  reasoningMenuRef,
  selectedModelLabel,
  selectedModelValue,
  selectedSupportsAttachments,
  thinkingMode,
  queuedDraft,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const submittedDraft = draft.trim();

    if (busy) {
      if (!submittedDraft) return;
      if (!onQueueDraft(submittedDraft)) return;
      setDraft("");
      return;
    }

    if (!submittedDraft && pendingFiles.length === 0) return;

    const submittedFiles = pendingFiles;
    setDraft("");
    setPendingFiles([]);

    const shouldClear = await onSubmit({
      draft,
      files: submittedFiles,
    });
    if (shouldClear) return;

    setDraft(draft);
    setPendingFiles(submittedFiles);
  }

  function handleAddPendingFiles(files: File[]) {
    if (files.length === 0) return;
    setPendingFiles((current) => [...current, ...files]);
  }

  function handleRemovePendingFile(index: number) {
    setPendingFiles((current) =>
      current.filter((_, fileIndex) => fileIndex !== index),
    );
  }

  function handleEditQueuedDraft() {
    if (!queuedDraft) return;
    setDraft(queuedDraft);
    onDeleteQueuedDraft();
  }

  const hasDraftText = draft.trim().length > 0;
  const sendButtonMode = busy && !hasDraftText ? "stop" : "send";

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {queuedDraft ? (
        <div className="queued-draft">
          <span>{queuedDraft}</span>
          <div className="queued-draft-actions" aria-label="Queued draft actions">
            <button
              disabled={!busy}
              onClick={onSteerQueuedDraft}
              type="button"
            >
              Steer
            </button>
            <button onClick={handleEditQueuedDraft} type="button">
              Edit
            </button>
            <button
              className="queued-draft-delete"
              onClick={onDeleteQueuedDraft}
              type="button"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
      <div className="composer-box">
        <PendingAttachments
          files={pendingFiles}
          onRemove={handleRemovePendingFile}
        />
        <textarea
          data-composer-input="true"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onDraftKeyDown}
          placeholder="Ask anything..."
          rows={3}
          value={draft}
        />
        <input
          multiple
          onChange={(event) => {
            handleAddPendingFiles(Array.from(event.target.files ?? []));
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
            disabled={
              sendButtonMode === "send" &&
              !hasDraftText &&
              pendingFiles.length === 0
            }
            mode={sendButtonMode}
            onStopResponse={onStopResponse}
          />
        </div>
      </div>
    </form>
  );
}
