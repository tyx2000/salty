import { Check } from "lucide-react";
import {
  colorSchemes,
  fontFamilies,
  fontSizes,
  type CustomColorScheme,
  type UserPreferences,
} from "@/lib/userPreferences";

/** Props for preference-backed settings panels. */
type AppearancePanelProps = {
  /** Current local preference state. */
  preferences: UserPreferences;
  /** Persists and applies changed preference state. */
  updatePreferences: (preferences: UserPreferences) => void;
};

/** Displays appearance settings. */
export function AppearancePanel({
  preferences,
  updatePreferences,
}: AppearancePanelProps) {
  function updateCustomColor(key: keyof CustomColorScheme, value: string) {
    updatePreferences({
      ...preferences,
      colorScheme: "custom",
      customColorScheme: {
        ...preferences.customColorScheme,
        [key]: value,
      },
    });
  }

  return (
    <section className="settings-panel">
      <header className="settings-panel-header">
        <div>
          <span>Appearance</span>
          <h1>Display</h1>
        </div>
      </header>
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Color scheme</h2>
          <span>{colorSchemes.length} palettes</span>
        </div>
        <div className="palette-grid">
          {colorSchemes.map((scheme) => {
            const selected = preferences.colorScheme === scheme.id;
            const swatches =
              scheme.id === "custom" ? preferences.customColorScheme : scheme.swatches;
            return (
              <button
                aria-pressed={selected}
                className={selected ? "palette-option active" : "palette-option"}
                key={scheme.id}
                onClick={() =>
                  updatePreferences({
                    ...preferences,
                    colorScheme: scheme.id,
                  })
                }
                type="button"
              >
                <span className="palette-preview" aria-hidden="true">
                  <span style={{ background: swatches.canvas }} />
                  <span style={{ background: swatches.muted }} />
                  <span style={{ background: swatches.user }} />
                  <span style={{ background: swatches.accent }} />
                </span>
                <span>
                  <strong>{scheme.label}</strong>
                  <small>{scheme.description}</small>
                </span>
                {selected ? <Check size={15} /> : null}
              </button>
            );
          })}
        </div>
        <div className="custom-palette-controls">
          <div>
            <strong>Custom palette</strong>
            <span>Choosing any color below switches the scheme to Custom.</span>
          </div>
          <div className="color-control-grid">
            {(
              [
                ["canvas", "Canvas"],
                ["muted", "Muted surface"],
                ["user", "User bubble"],
                ["accent", "Accent"],
              ] as const
            ).map(([key, label]) => (
              <label className="color-control" key={key}>
                <span>{label}</span>
                <input
                  onChange={(event) => updateCustomColor(key, event.target.value)}
                  type="color"
                  value={preferences.customColorScheme[key]}
                />
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Typography</h2>
          <span>Local preview</span>
        </div>
        <div className="settings-control-grid">
          <label>
            <span>Font</span>
            <select
              onChange={(event) =>
                updatePreferences({
                  ...preferences,
                  fontFamily: event.target.value as UserPreferences["fontFamily"],
                })
              }
              value={preferences.fontFamily}
            >
              {fontFamilies.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Size</span>
            <select
              onChange={(event) =>
                updatePreferences({
                  ...preferences,
                  fontSize: event.target.value as UserPreferences["fontSize"],
                })
              }
              value={preferences.fontSize}
            >
              {fontSizes.map((size) => (
                <option key={size.id} value={size.id}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="font-preview">
          <strong>Preview</strong>
          <p>The assistant response and composer use this local typography.</p>
        </div>
      </div>
    </section>
  );
}
