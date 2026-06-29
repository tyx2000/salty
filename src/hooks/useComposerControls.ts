import {
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ReasoningEffort, ThinkingMode } from "@/types/domain";
import { useClickOutside } from "@/hooks/useClickOutside";

/**
 * Owns composer-local UI state: draft text, pending files, thinking/reasoning
 * selections, and open/close behavior for composer menus.
 */
export function useComposerControls() {
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("disabled");
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("default");
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useClickOutside({
    open: modelMenuOpen,
    ref: modelMenuRef,
    onClose: () => setModelMenuOpen(false),
  });

  useClickOutside({
    open: reasoningMenuOpen,
    ref: reasoningMenuRef,
    onClose: () => setReasoningMenuOpen(false),
  });

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
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

  function handleReasoningEffortChange(value: ReasoningEffort) {
    setReasoningEffort(value);
    setReasoningMenuOpen(false);
  }

  function toggleModelMenu() {
    setReasoningMenuOpen(false);
    setModelMenuOpen((value) => !value);
  }

  function toggleReasoningMenu() {
    setModelMenuOpen(false);
    setReasoningMenuOpen((value) => !value);
  }

  function toggleThinkingMode() {
    setThinkingMode((current) =>
      current === "enabled" ? "disabled" : "enabled",
    );
  }

  function closeModelMenu() {
    setModelMenuOpen(false);
  }

  return {
    closeModelMenu,
    draft,
    fileInputRef,
    handleAddPendingFiles,
    handleDraftKeyDown,
    handleReasoningEffortChange,
    handleRemovePendingFile,
    modelMenuOpen,
    modelMenuRef,
    pendingFiles,
    reasoningEffort,
    reasoningMenuOpen,
    reasoningMenuRef,
    setDraft,
    setPendingFiles,
    thinkingMode,
    toggleModelMenu,
    toggleReasoningMenu,
    toggleThinkingMode,
  };
}
