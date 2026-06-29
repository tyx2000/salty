import {
  shortcutActions,
  type ShortcutActionId,
  type UserPreferences,
} from "@/lib/userPreferences";

/** Props for preference-backed shortcut settings. */
type ShortcutPanelProps = {
  /** Current local preference state. */
  preferences: UserPreferences;
  /** Persists and applies changed preference state. */
  updatePreferences: (preferences: UserPreferences) => void;
};

/** Displays editable keyboard shortcut rows. */
export function ShortcutPanel({
  preferences,
  updatePreferences,
}: ShortcutPanelProps) {
  function updateShortcut(
    actionId: ShortcutActionId,
    patch: Partial<UserPreferences["shortcuts"][ShortcutActionId]>,
  ) {
    updatePreferences({
      ...preferences,
      shortcuts: {
        ...preferences.shortcuts,
        [actionId]: {
          ...preferences.shortcuts[actionId],
          ...patch,
        },
      },
    });
  }

  return (
    <section className="settings-panel compact">
      <header className="settings-panel-header">
        <div>
          <span>Shortcut</span>
          <h1>Keyboard</h1>
        </div>
      </header>
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Composer defaults</h2>
          <span>Fixed input behavior</span>
        </div>
        <div className="shortcut-list">
          <div>
            <span>Send</span>
            <kbd>Enter</kbd>
          </div>
          <div>
            <span>New line</span>
            <kbd>Shift Enter</kbd>
          </div>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Custom shortcuts</h2>
          <span>Editable and optional</span>
        </div>
        <div className="shortcut-config-list">
          {shortcutActions.map((action) => {
            const shortcut = preferences.shortcuts[action.id];
            return (
              <div className="shortcut-config-row" key={action.id}>
                <label className="switch-control">
                  <input
                    checked={shortcut.enabled}
                    onChange={(event) =>
                      updateShortcut(action.id, {
                        enabled: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  <span />
                </label>
                <div>
                  <strong>{action.label}</strong>
                  <span>{action.description}</span>
                </div>
                <input
                  aria-label={`${action.label} shortcut`}
                  className="shortcut-key-input"
                  disabled={!shortcut.enabled}
                  onChange={(event) =>
                    updateShortcut(action.id, {
                      keys: event.target.value,
                    })
                  }
                  value={shortcut.keys}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
