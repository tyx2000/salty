import { languageStyles, type UserPreferences } from "@/lib/userPreferences";

/** Props for preference-backed personalization settings. */
type PersonalizationPanelProps = {
  /** Current local preference state. */
  preferences: UserPreferences;
  /** Persists and applies changed preference state. */
  updatePreferences: (preferences: UserPreferences) => void;
};

/** Displays personalization settings. */
export function PersonalizationPanel({
  preferences,
  updatePreferences,
}: PersonalizationPanelProps) {
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
              On lets future saved memory be injected as extra context. Off
              tells the assistant to use only the current conversation, current
              files, and explicit instructions. This project now stores the
              switch; memory item capture and review still need a dedicated
              memory store.
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
          onChange={(event) =>
            updatePreferences({
              ...preferences,
              globalInstructions: event.target.value,
            })
          }
          placeholder="Example: Answer in concise Chinese. Prefer direct implementation details. Ask before destructive operations."
          rows={7}
          value={preferences.globalInstructions}
        />
      </div>
    </section>
  );
}
