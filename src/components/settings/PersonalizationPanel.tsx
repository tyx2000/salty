import { useEffect, useState } from "react";
import { Check, CircleOff, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import {
  createUserMemory,
  deleteUserMemory,
  loadUserMemories,
  updateUserMemory,
  type UserMemory,
} from "@/lib/userMemories";
import { languageStyles, type UserPreferences } from "@/lib/userPreferences";

/** Props for preference-backed personalization settings. */
type PersonalizationPanelProps = {
  /** Current local preference state. */
  preferences: UserPreferences;
  /** Persists and applies changed preference state. */
  updatePreferences: (preferences: UserPreferences) => void;
  /** Current authenticated user id used for memory management. */
  userId: string;
};

/** Displays personalization settings. */
export function PersonalizationPanel({
  preferences,
  updatePreferences,
  userId,
}: PersonalizationPanelProps) {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState("");
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [loadingMemories, setLoadingMemories] = useState(true);
  const [savingMemory, setSavingMemory] = useState(false);
  const [globalInstructionsDraft, setGlobalInstructionsDraft] = useState(
    preferences.globalInstructions,
  );
  const [globalInstructionsFocused, setGlobalInstructionsFocused] =
    useState(false);

  useEffect(() => {
    if (globalInstructionsFocused) return;
    setGlobalInstructionsDraft(preferences.globalInstructions);
  }, [globalInstructionsFocused, preferences.globalInstructions]);

  useEffect(() => {
    let cancelled = false;

    async function loadMemories() {
      setLoadingMemories(true);
      setMemoryError(null);
      try {
        const rows = await loadUserMemories(userId);
        if (!cancelled) setMemories(rows);
      } catch (error) {
        if (!cancelled) {
          setMemoryError(
            error instanceof Error ? error.message : "Unable to load memories.",
          );
        }
      } finally {
        if (!cancelled) setLoadingMemories(false);
      }
    }

    void loadMemories();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function addMemory() {
    if (!memoryDraft.trim() || savingMemory) return;
    setSavingMemory(true);
    setMemoryError(null);
    try {
      const memory = await createUserMemory(userId, memoryDraft);
      setMemories((current) => [memory, ...current]);
      setMemoryDraft("");
    } catch (error) {
      setMemoryError(
        error instanceof Error ? error.message : "Unable to add memory.",
      );
    } finally {
      setSavingMemory(false);
    }
  }

  async function saveMemory(memoryId: string) {
    if (!editingMemoryText.trim() || savingMemory) return;
    setSavingMemory(true);
    setMemoryError(null);
    try {
      const memory = await updateUserMemory(userId, memoryId, {
        content: editingMemoryText,
      });
      setMemories((current) =>
        current.map((item) => (item.id === memory.id ? memory : item)),
      );
      setEditingMemoryId(null);
      setEditingMemoryText("");
    } catch (error) {
      setMemoryError(
        error instanceof Error ? error.message : "Unable to save memory.",
      );
    } finally {
      setSavingMemory(false);
    }
  }

  async function setMemoryStatus(
    memoryId: string,
    status: UserMemory["status"],
  ) {
    if (savingMemory) return;
    setSavingMemory(true);
    setMemoryError(null);
    try {
      const memory = await updateUserMemory(userId, memoryId, { status });
      setMemories((current) =>
        current.map((item) => (item.id === memory.id ? memory : item)),
      );
    } catch (error) {
      setMemoryError(
        error instanceof Error ? error.message : "Unable to update memory.",
      );
    } finally {
      setSavingMemory(false);
    }
  }

  async function removeMemory(memoryId: string) {
    if (savingMemory) return;
    setSavingMemory(true);
    setMemoryError(null);
    try {
      await deleteUserMemory(userId, memoryId);
      setMemories((current) => current.filter((item) => item.id !== memoryId));
      if (editingMemoryId === memoryId) {
        setEditingMemoryId(null);
        setEditingMemoryText("");
      }
    } catch (error) {
      setMemoryError(
        error instanceof Error ? error.message : "Unable to delete memory.",
      );
    } finally {
      setSavingMemory(false);
    }
  }

  function commitGlobalInstructions() {
    setGlobalInstructionsFocused(false);
    if (globalInstructionsDraft === preferences.globalInstructions) return;
    updatePreferences({
      ...preferences,
      globalInstructions: globalInstructionsDraft,
    });
  }

  const activeMemoryCount = memories.filter(
    (memory) => memory.status === "active",
  ).length;

  return (
    <section className="settings-panel">
      <header className="settings-panel-header">
        <div>
          <span>Personalization</span>
          <h1>Assistant behavior</h1>
        </div>
      </header>
      <div className="settings-section">
        <div className="settings-option-row tall">
          <div>
            <span>Memory</span>
            <p>
              On lets active saved memories be injected as extra context and
              allows explicit "remember" requests to create new memories. Off
              skips memory reads and automatic chat writes.
            </p>
          </div>
          <label className="switch-control">
            <input
              checked={preferences.memoryEnabled}
              onChange={(event) =>
                updatePreferences({
                  ...preferences,
                  memoryEnabled: event.target.checked,
                })
              }
              type="checkbox"
            />
            <span />
          </label>
        </div>
        <div className="memory-manager">
          <div className="settings-section-header compact">
            <h2>Saved memories</h2>
            <span>
              {preferences.memoryEnabled
                ? `${activeMemoryCount} active`
                : "Not used while memory is off"}
            </span>
          </div>
          <div className="memory-add-row">
            <input
              className="settings-input"
              onChange={(event) => setMemoryDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addMemory();
                }
              }}
              placeholder="Add a memory, e.g. Prefer terse Chinese answers."
              value={memoryDraft}
            />
            <button
              className="icon-button"
              disabled={!memoryDraft.trim() || savingMemory}
              onClick={() => void addMemory()}
              title="Add memory"
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
          {memoryError ? <p className="memory-error">{memoryError}</p> : null}
          <div className="memory-list">
            {loadingMemories ? (
              <div className="memory-empty">Loading memories...</div>
            ) : null}
            {!loadingMemories && memories.length === 0 ? (
              <div className="memory-empty">No saved memories yet.</div>
            ) : null}
            {memories.map((memory) => {
              const editing = editingMemoryId === memory.id;
              return (
                <div
                  className={
                    memory.status === "active"
                      ? "memory-item"
                      : "memory-item archived"
                  }
                  key={memory.id}
                >
                  <div className="memory-content">
                    {editing ? (
                      <input
                        autoFocus
                        className="settings-input"
                        onChange={(event) =>
                          setEditingMemoryText(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveMemory(memory.id);
                          }
                          if (event.key === "Escape") {
                            setEditingMemoryId(null);
                            setEditingMemoryText("");
                          }
                        }}
                        value={editingMemoryText}
                      />
                    ) : (
                      <>
                        <strong>{memory.content}</strong>
                        <span>
                          {memory.status === "active" ? "Active" : "Disabled"}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="memory-actions">
                    {editing ? (
                      <>
                        <button
                          className="icon-button"
                          disabled={!editingMemoryText.trim() || savingMemory}
                          onClick={() => void saveMemory(memory.id)}
                          title="Save memory"
                          type="button"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => {
                            setEditingMemoryId(null);
                            setEditingMemoryText("");
                          }}
                          title="Cancel editing"
                          type="button"
                        >
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="icon-button"
                          onClick={() => {
                            setEditingMemoryId(memory.id);
                            setEditingMemoryText(memory.content);
                          }}
                          title="Edit memory"
                          type="button"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() =>
                            void setMemoryStatus(
                              memory.id,
                              memory.status === "active" ? "archived" : "active",
                            )
                          }
                          title={
                            memory.status === "active"
                              ? "Disable memory"
                              : "Enable memory"
                          }
                          type="button"
                        >
                          {memory.status === "active" ? (
                            <CircleOff size={15} />
                          ) : (
                            <RotateCcw size={15} />
                          )}
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => void removeMemory(memory.id)}
                          title="Delete memory"
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Language style</h2>
          <span>Applied to every answer</span>
        </div>
        <div className="language-style-grid">
          {languageStyles.map((style) => {
            const selected = preferences.languageStyle === style.id;
            return (
              <button
                aria-pressed={selected}
                className={
                  selected ? "language-style-option active" : "language-style-option"
                }
                key={style.id}
                onClick={() =>
                  updatePreferences({
                    ...preferences,
                    languageStyle: style.id,
                  })
                }
                type="button"
              >
                <strong>{style.label}</strong>
                <span>{style.description}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Global instructions</h2>
          <span>Applied to every request</span>
        </div>
        <textarea
          className="settings-textarea"
          onBlur={commitGlobalInstructions}
          onChange={(event) => setGlobalInstructionsDraft(event.target.value)}
          onFocus={() => setGlobalInstructionsFocused(true)}
          placeholder="Example: Answer in concise Chinese. Prefer direct implementation details. Ask before destructive operations."
          rows={7}
          value={globalInstructionsDraft}
        />
      </div>
    </section>
  );
}
