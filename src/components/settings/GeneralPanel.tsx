/** Displays general app defaults and data behavior. */
export function GeneralPanel() {
  return (
    <section className="settings-panel compact">
      <header className="settings-panel-header">
        <div>
          <span>General</span>
          <h1>Application defaults</h1>
        </div>
      </header>
      <div className="settings-copy">
        <p>
          General is best for app-wide behavior that is not visual, provider-specific,
          or model-specific: startup behavior, default conversation behavior, language,
          data controls, and notification preferences.
        </p>
      </div>
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Current content</h2>
          <span>Shown in this build</span>
        </div>
        <div className="settings-option-list">
          <div className="settings-option-row">
            <span>Startup route</span>
            <strong>Last active conversation</strong>
          </div>
          <div className="settings-option-row">
            <span>New chat title</span>
            <strong>First message</strong>
          </div>
          <div className="settings-option-row">
            <span>Language</span>
            <strong>System default</strong>
          </div>
          <div className="settings-option-row">
            <span>Local settings storage</span>
            <strong>This browser</strong>
          </div>
          <div className="settings-option-row">
            <span>Encrypted cloud data</span>
            <strong>Conversations and provider keys</strong>
          </div>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-section-header">
          <h2>Typical general settings</h2>
          <span>Belongs here later</span>
        </div>
        <div className="settings-option-list">
          <div className="settings-option-row">
            <span>Startup behavior</span>
            <strong>Last chat, new chat, or home</strong>
          </div>
          <div className="settings-option-row">
            <span>Default chat behavior</span>
            <strong>Title, archive, and confirm rules</strong>
          </div>
          <div className="settings-option-row">
            <span>App language</span>
            <strong>System, English, or Chinese</strong>
          </div>
          <div className="settings-option-row">
            <span>Data controls</span>
            <strong>Export, import, clear, or delete</strong>
          </div>
          <div className="settings-option-row">
            <span>Notifications</span>
            <strong>Desktop and completion alerts</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
